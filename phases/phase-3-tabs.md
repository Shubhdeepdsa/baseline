# Baseline — Phase 3: Brain Dump + AI Versions Tabs

## What this phase produces
The first two tabs are fully working. You can write your brain dump, copy it to clipboard, paste AI output into the versions tab, save it as a versioned file, browse version history, and set any version as active. The active version is what the ghost text will read from in Phase 5.

## End state checklist
- [ ] Brain Dump tab: textarea works, auto-saves every 30 seconds, copy button works
- [ ] AI Versions tab: paste area works, "Save as new version" creates a timestamped file
- [ ] Version history list shows all saved versions with timestamps
- [ ] Clicking a version shows its content in the preview panel
- [ ] Active version is indicated with "ghost source" badge
- [ ] Switching projects loads the correct data for that project

---

## Step 1 — Create the BrainDumpEditor component

Create `src/components/BrainDumpEditor.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react'
import styles from './BrainDumpEditor.module.css'

export default function BrainDumpEditor({ projectId }) {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(true)
  const autoSaveTimer = useRef(null)

  // Load content when project changes
  useEffect(() => {
    if (!projectId) return
    window.electron.readFile(projectId, 'braindump').then(result => {
      setContent(result.content || '')
      setSaved(true)
    })
  }, [projectId])

  // Auto-save every 30 seconds
  useEffect(() => {
    if (saved) return
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      handleSave()
    }, 30000)
    return () => clearTimeout(autoSaveTimer.current)
  }, [content, saved])

  async function handleSave() {
    await window.electron.saveFile(projectId, 'braindump', content)
    setSaved(true)
  }

  function handleChange(e) {
    setContent(e.target.value)
    setSaved(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(content)
  }

  // Save on blur
  async function handleBlur() {
    if (!saved) await handleSave()
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>Raw brain dump</span>
        <span className={styles.savedIndicator}>{saved ? 'Saved' : 'Unsaved'}</span>
      </div>
      <textarea
        className={styles.textarea}
        value={content}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Write anything here. Broken English, bullet points, half-sentences — whatever gets the idea out. This is just for you."
        spellCheck={false}
      />
      <div className={styles.footer}>
        <p className={styles.hint}>
          When you're done, copy this and paste it into your AI of choice. Then save what it gives you in the AI Versions tab.
        </p>
        <button className={styles.copyBtn} onClick={handleCopy}>
          Copy to clipboard →
        </button>
      </div>
    </div>
  )
}
```

Create `src/components/BrainDumpEditor.module.css`:

```css
.container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 48px 0;
}

.label {
  font-size: 10px;
  color: var(--text3);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.savedIndicator {
  font-size: 10px;
  color: var(--text3);
}

.textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  padding: 20px 48px;
  font-family: 'Lora', 'Georgia', serif;
  font-size: 15px;
  line-height: 1.9;
  color: var(--text2);
  caret-color: var(--accent);
}

.textarea::placeholder {
  color: var(--text3);
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-top: 1px solid var(--border);
  background: var(--bg2);
  gap: 16px;
}

.hint {
  font-size: 11px;
  color: var(--text3);
  line-height: 1.5;
}

.copyBtn {
  background: var(--bg4);
  border: 1px solid var(--border2);
  border-radius: 6px;
  color: var(--text2);
  font-size: 11px;
  padding: 7px 14px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.15s, border-color 0.15s;
}

.copyBtn:hover {
  color: var(--accent);
  border-color: var(--accent-border);
}
```

---

## Step 2 — Create the AIVersionPanel component

Create `src/components/AIVersionPanel.jsx`:

```jsx
import { useState, useEffect } from 'react'
import styles from './AIVersionPanel.module.css'

function formatDate(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) {
    return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  if (diffHours < 48) return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function AIVersionPanel({ projectId, onActiveVersionChange }) {
  const [versions, setVersions] = useState([])
  const [activeVersion, setActiveVersion] = useState(null)
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [selectedContent, setSelectedContent] = useState('')
  const [pasteContent, setPasteContent] = useState('')
  const [showPasteArea, setShowPasteArea] = useState(false)

  useEffect(() => {
    if (!projectId) return
    loadVersions()
  }, [projectId])

  async function loadVersions() {
    const result = await window.electron.getVersions(projectId)
    setVersions(result)
    // Always use the most recent version as active
    if (result.length > 0) {
      const latest = result[0]
      setActiveVersion(latest.filename)
      selectVersion(latest)
    }
  }

  async function selectVersion(version) {
    setSelectedVersion(version.filename)
    const result = await window.electron.readVersion(projectId, version.filename)
    setSelectedContent(result.content || '')
  }

  async function handleSaveVersion() {
    if (!pasteContent.trim()) return
    await window.electron.saveVersion(projectId, pasteContent.trim())
    setPasteContent('')
    setShowPasteArea(false)
    await loadVersions()
  }

  async function handleSetActive(filename) {
    setActiveVersion(filename)
    const result = await window.electron.readVersion(projectId, filename)
    if (onActiveVersionChange) {
      onActiveVersionChange(result.content || '')
    }
  }

  async function handleDeleteVersion(filename, e) {
    e.stopPropagation()
    await window.electron.deleteVersion(projectId, filename)
    await loadVersions()
  }

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.header}>
          <span className={styles.title}>AI versions</span>
          <button
            className={styles.saveBtn}
            onClick={() => setShowPasteArea(!showPasteArea)}
          >
            + Save new version
          </button>
        </div>

        {showPasteArea && (
          <div className={styles.pasteArea}>
            <textarea
              className={styles.pasteTextarea}
              value={pasteContent}
              onChange={e => setPasteContent(e.target.value)}
              placeholder="Paste the AI-generated text here..."
              autoFocus
            />
            <div className={styles.pasteActions}>
              <button className={styles.cancelBtn} onClick={() => { setShowPasteArea(false); setPasteContent('') }}>
                Cancel
              </button>
              <button className={styles.confirmBtn} onClick={handleSaveVersion}>
                Save version
              </button>
            </div>
          </div>
        )}

        <div className={styles.versionList}>
          {versions.length === 0 && (
            <div className={styles.empty}>
              No versions yet. Paste your AI output and save it as a version.
            </div>
          )}
          {versions.map((version) => (
            <div
              key={version.filename}
              className={`${styles.versionItem} ${selectedVersion === version.filename ? styles.selected : ''}`}
              onClick={() => selectVersion(version)}
            >
              <div className={styles.versionLeft}>
                <span className={`${styles.badge} ${activeVersion === version.filename ? styles.activeBadge : styles.inactiveBadge}`}>
                  v{version.versionNumber}{activeVersion === version.filename ? ' — active' : ''}
                </span>
                <div>
                  <div className={styles.versionDate}>{formatDate(version.createdAt)}</div>
                </div>
              </div>
              <div className={styles.versionRight}>
                {activeVersion === version.filename
                  ? <span className={styles.ghostLabel}>ghost source</span>
                  : <button
                      className={styles.setActiveBtn}
                      onClick={(e) => { e.stopPropagation(); handleSetActive(version.filename) }}
                    >
                      Set active
                    </button>
                }
                <button
                  className={styles.deleteBtn}
                  onClick={(e) => handleDeleteVersion(version.filename, e)}
                  title="Delete version"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.right}>
        {selectedContent
          ? <div className={styles.preview}>{selectedContent}</div>
          : <div className={styles.previewEmpty}>Select a version to preview it</div>
        }
      </div>
    </div>
  )
}
```

Create `src/components/AIVersionPanel.module.css`:

```css
.container {
  flex: 1;
  display: flex;
  overflow: hidden;
  background: var(--bg);
}

.left {
  width: 340px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.saveBtn {
  background: var(--bg4);
  border: 1px solid var(--accent-border);
  border-radius: 6px;
  color: var(--accent);
  font-size: 11px;
  padding: 5px 10px;
  cursor: pointer;
  font-family: inherit;
}

.saveBtn:hover {
  background: var(--accent-bg);
}

.pasteArea {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg3);
  flex-shrink: 0;
}

.pasteTextarea {
  width: 100%;
  height: 120px;
  background: var(--bg4);
  border: 1px solid var(--border2);
  border-radius: 7px;
  padding: 10px 12px;
  font-family: 'Lora', 'Georgia', serif;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  resize: none;
  outline: none;
  caret-color: var(--accent);
}

.pasteTextarea::placeholder {
  color: var(--text3);
}

.pasteTextarea:focus {
  border-color: var(--accent-border);
}

.pasteActions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 10px;
}

.cancelBtn {
  background: none;
  border: 1px solid var(--border2);
  border-radius: 6px;
  color: var(--text2);
  font-size: 11px;
  padding: 6px 12px;
  cursor: pointer;
  font-family: inherit;
}

.confirmBtn {
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: var(--bg);
  font-size: 11px;
  font-weight: 500;
  padding: 6px 12px;
  cursor: pointer;
  font-family: inherit;
}

.versionList {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.empty {
  font-size: 12px;
  color: var(--text3);
  padding: 16px 10px;
  line-height: 1.6;
}

.versionItem {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 10px 12px;
  cursor: pointer;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.versionItem:hover {
  background: var(--bg4);
}

.versionItem.selected {
  background: var(--bg4);
  border-color: var(--accent-border);
}

.versionLeft {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}

.activeBadge {
  color: var(--accent);
  background: var(--accent-bg);
}

.inactiveBadge {
  color: var(--text2);
  background: var(--bg3);
  border: 1px solid var(--border2);
}

.versionDate {
  font-size: 11px;
  color: var(--text2);
}

.versionRight {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.ghostLabel {
  font-size: 10px;
  color: var(--accent);
}

.setActiveBtn {
  background: none;
  border: 1px solid var(--border2);
  border-radius: 4px;
  color: var(--text3);
  font-size: 10px;
  padding: 2px 7px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}

.setActiveBtn:hover {
  color: var(--accent);
  border-color: var(--accent-border);
}

.deleteBtn {
  background: none;
  border: none;
  color: var(--text3);
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}

.deleteBtn:hover {
  color: #E24B4A;
}

.right {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px;
}

.preview {
  font-family: 'Lora', 'Georgia', serif;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text2);
  white-space: pre-wrap;
}

.previewEmpty {
  font-size: 12px;
  color: var(--text3);
  padding-top: 16px;
}
```

---

## Step 3 — Update ProjectView to use the real components

Replace `src/components/ProjectView.jsx`:

```jsx
import { useState } from 'react'
import styles from './ProjectView.module.css'
import BrainDumpEditor from './BrainDumpEditor'
import AIVersionPanel from './AIVersionPanel'

const TABS = [
  { id: 'braindump', label: 'Brain dump' },
  { id: 'versions', label: 'AI versions' },
  { id: 'writing', label: 'Writing' },
]

export default function ProjectView({ projectId }) {
  const [activeTab, setActiveTab] = useState('writing')
  const [activeVersionContent, setActiveVersionContent] = useState('')

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === 'braindump' && (
          <BrainDumpEditor projectId={projectId} />
        )}
        {activeTab === 'versions' && (
          <AIVersionPanel
            projectId={projectId}
            onActiveVersionChange={setActiveVersionContent}
          />
        )}
        {activeTab === 'writing' && (
          <div className={styles.placeholder}>
            Writing Editor — coming in Phase 4
            {activeVersionContent && (
              <p style={{ marginTop: 12, fontSize: 11, opacity: 0.5 }}>
                Active version loaded ({activeVersionContent.length} chars)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## Step 4 — Run and verify

```bash
npm run dev
```

Test the full workflow:
1. Create a project
2. Go to Brain Dump tab — type something, blur the field — it auto-saves
3. Click "Copy to clipboard" — paste it into a text editor to confirm it copied
4. Go to AI Versions tab — click "+ Save new version"
5. Paste some text, click "Save version"
6. The version appears in the list with a timestamp
7. It shows "v1 — active" and "ghost source"
8. Click "+ Save new version" again, paste different text, save
9. Version list shows v2 (active) and v1
10. Click v1 → "Set active" → it becomes the ghost source
11. Check `~/Baseline/projects/[your-project]/ai-versions/` in Finder — files should be there

If all 11 steps work, Phase 3 is done.
