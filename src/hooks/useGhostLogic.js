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
