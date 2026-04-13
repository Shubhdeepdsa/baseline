import { useState, useEffect, useRef, useCallback } from 'react'
import { useEmbeddings } from './useEmbeddings'
import { cosineSimilarity, similarityToState, COVER_THRESHOLD } from '../utils/similarity'
import { splitSentences, splitIntoGhostSentences } from '../utils/sentenceSplit'
import { getWordSuggestion } from '../utils/suggestion'

export function useGhostLogic(activeVersionContent, removedSentenceIds = [], settings = {}) {
  const { embed, status: embedStatus } = useEmbeddings()
  const enableMiniLM = settings.enableMiniLM !== false
  const enableIntellisense = settings.enableIntellisense !== false

  // Array of ghost sentence objects: { id, text, start, end, state, covered, removed }
  // state: 'dim' | 'yellow' | 'orange' | 'green'
  // covered: boolean — once true, the sentence fades out permanently
  const [ghosts, setGhosts] = useState([])
  const [ghostSourceText, setGhostSourceText] = useState('')
  const [suggestion, setSuggestion] = useState('')

  // Pre-computed embeddings for each ghost sentence
  const ghostEmbeddings = useRef([])
  const removedIdSetRef = useRef(new Set())
  const textEmbeddingCacheRef = useRef(new Map())

  const debounceTimer = useRef(null)
  const ghostSentenceKey = ghosts.map(ghost => ghost.id).join('|')

  const getTextEmbedding = useCallback(async (text) => {
    const cached = textEmbeddingCacheRef.current.get(text)
    if (cached) return cached

    const embeddingPromise = embed(text).catch(error => {
      textEmbeddingCacheRef.current.delete(text)
      throw error
    })

    textEmbeddingCacheRef.current.set(text, embeddingPromise)
    return embeddingPromise
  }, [embed])

  useEffect(() => {
    removedIdSetRef.current = new Set(removedSentenceIds)
    setGhosts(prev => {
      let changed = false
      const nextGhosts = prev.map(ghost => {
        const removed = removedIdSetRef.current.has(ghost.id)
        if (ghost.removed === removed) return ghost
        changed = true
        return { ...ghost, removed }
      })

      return changed ? nextGhosts : prev
    })
  }, [removedSentenceIds])

  // When the active version changes, split it immediately so the ghost pane stays usable
  useEffect(() => {
    if (!activeVersionContent) {
      setGhosts([])
      setGhostSourceText('')
      ghostEmbeddings.current = []
      return
    }

    const { normalizedText, sentences } = splitIntoGhostSentences(activeVersionContent)
    if (sentences.length === 0) {
      setGhosts([])
      setGhostSourceText(normalizedText)
      ghostEmbeddings.current = []
      textEmbeddingCacheRef.current.clear()
      return
    }

    setGhostSourceText(normalizedText)

    // Initialise ghost objects
    const removedIds = removedIdSetRef.current
    setGhosts(sentences.map(sentence => ({
      ...sentence,
      state: 'dim',
      covered: false,
      removed: removedIds.has(sentence.id),
    })))
    ghostEmbeddings.current = []
    textEmbeddingCacheRef.current.clear()
  }, [activeVersionContent])

  useEffect(() => {
    if (!enableMiniLM || embedStatus !== 'ready' || ghosts.length === 0) return

    Promise.all(ghosts.map(ghost => getTextEmbedding(ghost.text))).then(embeddings => {
      ghostEmbeddings.current = embeddings
    })
  }, [embedStatus, getTextEmbedding, ghostSentenceKey, enableMiniLM])

  // Called on every editor update — debounced to 300ms
  const processText = useCallback((fullText) => {
    if (!enableMiniLM) {
       // If matching is disabled, we don't process similarity.
       // We can optionally still do intellisense, but let's clear it just in case
       if (suggestion) setSuggestion('')
       return
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    debounceTimer.current = setTimeout(async () => {
      if (ghostEmbeddings.current.length === 0) return

      if (!fullText) {
        setGhosts(prev => {
          let changed = false
          const nextGhosts = prev.map(ghost => {
            const removed = removedIdSetRef.current.has(ghost.id)
            const nextState = ghost.covered ? ghost.state : 'dim'
            if (ghost.removed === removed && ghost.state === nextState) return ghost
            changed = true
            return { ...ghost, removed, state: nextState }
          })

          return changed ? nextGhosts : prev
        })
        return
      }

      const { completedSentences, currentSentence } = splitSentences(fullText)

      // Step 1: Check completed sentences → auto-cover any matched ghosts
      const newCovered = new Set()
      for (const sentence of completedSentences) {
        if (sentence.length < 8) continue
        const emb = await getTextEmbedding(sentence)
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
      if (currentSentence.length >= 2) {
        const currEmb = await getTextEmbedding(currentSentence)
        currentSims = ghostEmbeddings.current.map(ghostEmb => cosineSimilarity(currEmb, ghostEmb))
      }

      // Determine if multiple ghosts are being combined
      const aboveCombineThreshold = currentSims.filter(sim => sim >= 0.30)
      const isCombining = aboveCombineThreshold.length > 1

      // Step 3: Update ghost states
      setGhosts(prev => {
        let maxSim = -1

        // Find WORD suggestion candidate
        let bestSuggestion = ''
        if (enableIntellisense && fullText.trim().length >= 1 && activeVersionContent) {
           bestSuggestion = getWordSuggestion(fullText, activeVersionContent)
        }
        
        // Update suggestion state asynchronously to avoid React warnings
        setTimeout(() => setSuggestion(bestSuggestion), 0)

        let changed = false
        const nextGhosts = prev.map((ghost, i) => {
          const isRemoved = removedIdSetRef.current.has(ghost.id)

          if (ghost.covered) {
            if (ghost.removed === isRemoved) return ghost
            changed = true
            return { ...ghost, removed: isRemoved }
          }

          if (newCovered.has(i)) {
            if (ghost.covered && ghost.removed === isRemoved && ghost.state === 'dim') return ghost
            changed = true
            return { ...ghost, covered: true, removed: isRemoved, state: 'dim' }
          }

          const sim = currentSims[i] || 0

          let state = similarityToState(sim)

          if (isCombining && state === 'green') state = 'yellow'
          if (isCombining && state === 'orange') state = 'yellow'

          if (ghost.removed === isRemoved && ghost.state === state) return ghost

          changed = true
          return { ...ghost, removed: isRemoved, state }
        })

        return changed ? nextGhosts : prev
      })
    }, 300)
  }, [getTextEmbedding, enableMiniLM, enableIntellisense, activeVersionContent])

  return { ghosts, ghostSourceText, embedStatus, processText, suggestion }
}
