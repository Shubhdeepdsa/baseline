# Baseline — Phase 5: Ghost Text Mechanic

## What this phase produces
This is the core feature. Below the cursor in the Writing tab, ghost sentences from the active AI version appear. As you type, the closest ghost sentence highlights in real time (green = strongly covering, orange = strong, yellow = moderate). When you finish a sentence, any ghost sentences that are semantically covered automatically fade away. The frontier advances as you write.

## End state checklist
- [ ] Ghost sentences appear below written text, dim by default
- [ ] As user types, current sentence's similarity scores update every 300ms
- [ ] Ghost sentences highlight in correct colour based on similarity
- [ ] When a sentence ends (. ! ?), completed text is checked against all ghosts
- [ ] Covered ghost sentences animate away smoothly
- [ ] Combining two ghost sentences into one lights up both in yellow
- [ ] MiniLM model loads once and is reused
- [ ] No lag while typing

---

## Step 1 — Install Transformers.js

```bash
npm install @xenova/transformers
```

---

## Step 2 — Create the similarity utility

Create `src/utils/similarity.js`:

```js
// Cosine similarity between two Float32Array embedding vectors
export function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// Classify similarity into a highlight state
// Returns: 'dim' | 'yellow' | 'orange' | 'green'
export function similarityToState(sim) {
  if (sim >= 0.70) return 'green'
  if (sim >= 0.50) return 'orange'
  if (sim >= 0.30) return 'yellow'
  return 'dim'
}

// Threshold above which a completed sentence is considered to "cover" a ghost
export const COVER_THRESHOLD = 0.42
```

---

## Step 3 — Create the sentence splitter utility

Create `src/utils/sentenceSplit.js`:

```js
// Split full text into:
// - completedSentences: sentences that have ended (. ! ?)
// - currentSentence: the in-progress text after the last sentence end
export function splitSentences(text) {
  if (!text || !text.trim()) {
    return { completedSentences: [], currentSentence: '' }
  }

  // Match sentence endings: . ! ? followed by space or end of string
  const sentenceEndRegex = /[.!?](?:\s|$)/g
  let lastEnd = 0
  const completedSentences = []
  let match

  while ((match = sentenceEndRegex.exec(text)) !== null) {
    const sentence = text.slice(lastEnd, match.index + 1).trim()
    if (sentence.length > 4) {
      completedSentences.push(sentence)
    }
    lastEnd = match.index + match[0].length
  }

  const currentSentence = text.slice(lastEnd).trim()

  return { completedSentences, currentSentence }
}

// Split a block of text (AI version) into individual sentences
export function splitIntoGhostSentences(text) {
  if (!text || !text.trim()) return []

  // Split on sentence endings, keeping the punctuation
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10)

  return sentences
}
```

---

## Step 4 — Create the useEmbeddings hook

Create `src/hooks/useEmbeddings.js`:

```js
import { useState, useEffect, useRef } from 'react'

let extractorInstance = null
let loadingPromise = null

export function useEmbeddings() {
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'

  useEffect(() => {
    if (extractorInstance) {
      setStatus('ready')
      return
    }
    if (loadingPromise) {
      loadingPromise.then(() => setStatus('ready')).catch(() => setStatus('error'))
      return
    }

    setStatus('loading')

    // Dynamic import to avoid issues with Electron's context
    loadingPromise = import('@xenova/transformers').then(async ({ pipeline }) => {
      extractorInstance = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { progress_callback: (p) => {
          // You can log progress here if needed
          console.log('Model loading:', p.status, p.progress)
        }}
      )
      setStatus('ready')
      return extractorInstance
    }).catch(err => {
      console.error('Failed to load embedding model:', err)
      setStatus('error')
      throw err
    })
  }, [])

  async function embed(text) {
    if (!extractorInstance) {
      if (loadingPromise) await loadingPromise
      else throw new Error('Embedding model not initialized')
    }
    const output = await extractorInstance(text, { pooling: 'mean', normalize: true })
    return output.data
  }

  return { embed, status }
}
```

---

## Step 5 — Create the useGhostLogic hook

Create `src/hooks/useGhostLogic.js`:

```js
import { useState, useEffect, useRef, useCallback } from 'react'
import { useEmbeddings } from './useEmbeddings'
import { cosineSimilarity, similarityToState, COVER_THRESHOLD } from '../utils/similarity'
import { splitSentences, splitIntoGhostSentences } from '../utils/sentenceSplit'

export function useGhostLogic(activeVersionContent) {
  const { embed, status: embedStatus } = useEmbeddings()

  // Array of ghost sentence objects: { text, state, covered }
  // state: 'dim' | 'yellow' | 'orange' | 'green'
  // covered: boolean — once true, the sentence fades out permanently
  const [ghosts, setGhosts] = useState([])

  // Pre-computed embeddings for each ghost sentence
  const ghostEmbeddings = useRef([])

  const debounceTimer = useRef(null)

  // When the active version changes, split it into sentences and embed them all
  useEffect(() => {
    if (!activeVersionContent || embedStatus !== 'ready') return

    const sentences = splitIntoGhostSentences(activeVersionContent)
    if (sentences.length === 0) return

    // Initialise ghost objects
    setGhosts(sentences.map(text => ({ text, state: 'dim', covered: false })))

    // Embed all ghost sentences up front (one-time cost per version)
    Promise.all(sentences.map(s => embed(s))).then(embeddings => {
      ghostEmbeddings.current = embeddings
    })
  }, [activeVersionContent, embedStatus])

  // Called on every editor update — debounced to 300ms
  const processText = useCallback((fullText) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    debounceTimer.current = setTimeout(async () => {
      if (!fullText || ghostEmbeddings.current.length === 0) return

      const { completedSentences, currentSentence } = splitSentences(fullText)

      // Step 1: Check completed sentences → auto-cover any matched ghosts
      const newCovered = new Set()
      for (const sentence of completedSentences) {
        if (sentence.length < 8) continue
        const emb = await embed(sentence)
        ghostEmbeddings.current.forEach((ghostEmb, i) => {
          if (newCovered.has(i)) return
          const sim = cosineSimilarity(emb, ghostEmb)
          if (sim >= COVER_THRESHOLD) {
            newCovered.add(i)
          }
        })
      }

      // Step 2: Current sentence → highlight matching ghosts
      let currentSims = []
      if (currentSentence.length >= 8) {
        const currEmb = await embed(currentSentence)
        currentSims = ghostEmbeddings.current.map((ghostEmb, i) => ({
          i,
          sim: cosineSimilarity(currEmb, ghostEmb),
        }))
      }

      // Determine if multiple ghosts are being combined
      const aboveCombineThreshold = currentSims.filter(s => s.sim >= 0.30)
      const isCombining = aboveCombineThreshold.length > 1

      // Step 3: Update ghost states
      setGhosts(prev => prev.map((ghost, i) => {
        // Already covered — stays covered
        if (ghost.covered) return ghost

        // Newly covered by completed sentence
        if (newCovered.has(i)) return { ...ghost, covered: true, state: 'dim' }

        // Not yet covered — determine highlight from current sentence
        const simEntry = currentSims.find(s => s.i === i)
        const sim = simEntry?.sim || 0

        let state = similarityToState(sim)

        // If combining multiple sentences, cap at yellow to signal combination
        if (isCombining && state === 'green') state = 'yellow'
        if (isCombining && state === 'orange') state = 'yellow'

        return { ...ghost, state }
      }))
    }, 300)
  }, [embed])

  return { ghosts, embedStatus, processText }
}
```

---

## Step 6 — Create the GhostLayer component

Create `src/components/GhostLayer.jsx`:

```jsx
import styles from './GhostLayer.module.css'

export default function GhostLayer({ ghosts }) {
  const visibleGhosts = ghosts.filter(g => !g.covered)

  if (visibleGhosts.length === 0) return null

  return (
    <div className={styles.wrapper}>
      {ghosts.map((ghost, i) => (
        <div
          key={i}
          className={`${styles.ghost} ${styles[ghost.state]} ${ghost.covered ? styles.covered : ''}`}
        >
          {ghost.text}
        </div>
      ))}
    </div>
  )
}
```

Create `src/components/GhostLayer.module.css`:

```css
.wrapper {
  margin-top: 8px;
  padding-top: 8px;
}

.ghost {
  font-family: 'Lora', 'Georgia', serif;
  font-size: 16px;
  line-height: 1.85;
  padding: 4px 10px;
  margin: 3px -10px;
  border-radius: 5px;
  transition: color 0.2s ease, background 0.2s ease, max-height 0.35s ease, opacity 0.35s ease, padding 0.3s ease, margin 0.3s ease;
  max-height: 120px;
  overflow: hidden;
  cursor: default;
}

/* dim — barely visible, not yet relevant */
.dim {
  color: var(--ghost-dim-text);
  background: transparent;
}

/* yellow — moderate overlap, getting there */
.yellow {
  color: var(--ghost-y-text);
  background: var(--ghost-y-bg);
}

/* orange — strong overlap */
.orange {
  color: var(--ghost-o-text);
  background: var(--ghost-o-bg);
}

/* green — user is clearly covering this sentence */
.green {
  color: var(--ghost-g-text);
  background: var(--ghost-g-bg);
}

/* covered — animated out */
.covered {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
}
```

---

## Step 7 — Update WritingEditor to use ghost logic

Replace `src/components/WritingEditor.jsx` — these are the key changes:

Add imports at the top:
```jsx
import { useGhostLogic } from '../hooks/useGhostLogic'
import GhostLayer from './GhostLayer'
```

Inside the component, add:
```jsx
const { ghosts, embedStatus, processText } = useGhostLogic(activeVersionContent)
const coveredCount = ghosts.filter(g => g.covered).length
```

In the `onUpdate` handler of `useEditor`, add a call to processText:
```jsx
onUpdate: ({ editor }) => {
  const text = editor.getText()
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  setWordCount(words)
  setSaved(false)

  // Ghost text processing
  processText(text)

  // Auto-save (existing code)
  setSaveTimer(prev => {
    if (prev) clearTimeout(prev)
    return setTimeout(() => {
      const markdown = editorToMarkdown(editor)
      window.electron.saveFile(projectId, 'writing', markdown)
      setSaved(true)
    }, 2000)
  })
},
```

Replace the ghost placeholder in the editorWrap section:
```jsx
{/* Ghost text layer */}
<GhostLayer ghosts={ghosts} />
```

Update the status bar to show covered count + model status:
```jsx
<div className={styles.statusBar}>
  <div className={styles.statusItem}>
    <div className={styles.statusDot} />
    {coveredCount > 0 ? `${coveredCount} of ${ghosts.length} covered` : `${wordCount} words`}
  </div>
  <div className={styles.statusItem} style={{ marginLeft: 'auto' }}>
    {embedStatus === 'loading' && <span className={styles.badge}>Loading model...</span>}
    {embedStatus === 'ready' && <span className={styles.badge}>MiniLM ready</span>}
    {embedStatus === 'error' && <span style={{ color: '#E24B4A', fontSize: 10 }}>Model error</span>}
  </div>
  <div className={styles.statusItem}>
    {saved ? 'Saved' : 'Saving...'}
  </div>
</div>
```

Add badge style to `WritingEditor.module.css`:
```css
.badge {
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  border-radius: 3px;
  color: var(--accent);
  font-size: 9px;
  padding: 1px 5px;
  letter-spacing: 0.05em;
}
```

---

## Step 8 — Configure Vite for Transformers.js

Transformers.js uses Web Workers and WASM. Update `vite.config.js` to handle this properly. Add the following to the vite config:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@xenova/transformers'],
  },
  build: {
    rollupOptions: {
      external: ['@xenova/transformers'],
    },
  },
})
```

---

## Step 9 — Run and verify

```bash
npm run dev
```

Test:
1. Create a project
2. Go to AI Versions, paste a few paragraphs of text, save as a version
3. Go to Writing tab — status bar should show "Loading model..." then "MiniLM ready" (takes ~10 seconds first time)
4. You should see ghost sentences appearing below (dim)
5. Start typing a sentence about the same topic as ghost sentence 1 — it should turn yellow, then orange, then green as you add more related words
6. Type a completely unrelated sentence — all ghosts should stay dim
7. Finish a sentence with a period — if it covers a ghost, that ghost should animate away
8. Type a sentence combining two ghost topics — both should highlight yellow simultaneously

If the highlights update in real time and ghosts fade away correctly, Phase 5 is done.

---

## Threshold tuning

If highlights feel too aggressive (too much lighting up) or too slow (not lighting up enough), adjust these values in `src/utils/similarity.js`:

```js
// Current values — adjust if needed
// COVER_THRESHOLD: how similar a completed sentence must be to clear a ghost
export const COVER_THRESHOLD = 0.42  // lower = clears more easily, higher = stricter

// In similarityToState:
if (sim >= 0.70) return 'green'   // lower if green feels too hard to reach
if (sim >= 0.50) return 'orange'  // adjust range
if (sim >= 0.30) return 'yellow'  // lower = more things turn yellow
```
