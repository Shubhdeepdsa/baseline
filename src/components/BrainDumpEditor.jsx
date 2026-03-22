import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './BrainDumpEditor.module.css'

export default function BrainDumpEditor({ projectId }) {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const contentRef = useRef('')
  const savedRef = useRef(true)
  const autoSaveTimer = useRef(null)

  // Keep refs in sync with state
  useEffect(() => { contentRef.current = content }, [content])
  useEffect(() => { savedRef.current = saved }, [saved])

  // Save function that always reads from ref (no stale closures)
  const doSave = useCallback(async () => {
    if (!projectId) return
    await window.electron.saveFile(projectId, 'braindump', contentRef.current)
    setSaved(true)
  }, [projectId])

  // Load content when project changes
  useEffect(() => {
    if (!projectId) return
    setLoaded(false)
    window.electron.readFile(projectId, 'braindump').then(result => {
      const text = result.content || ''
      setContent(text)
      contentRef.current = text
      setSaved(true)
      savedRef.current = true
      setLoaded(true)
    })
  }, [projectId])

  // Debounced auto-save (5 seconds after typing stops)
  useEffect(() => {
    if (saved || !loaded) return
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      doSave()
    }, 1000)
    return () => clearTimeout(autoSaveTimer.current)
  }, [content, saved, loaded, doSave])

  // Save on unmount (tab switch, project switch, etc.)
  useEffect(() => {
    return () => {
      clearTimeout(autoSaveTimer.current)
      if (!savedRef.current && contentRef.current !== undefined) {
        // Fire-and-forget save on unmount
        window.electron.saveFile(projectId, 'braindump', contentRef.current)
      }
    }
  }, [projectId])

  function handleChange(e) {
    setContent(e.target.value)
    setSaved(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(content)
  }

  // Save on blur
  async function handleBlur() {
    if (!saved && loaded) await doSave()
  }

  // Handle Cmd+S / Ctrl+S
  async function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (!saved && loaded) {
        await doSave()
      }
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>Raw brain dump</span>
        <span className={styles.savedIndicator} title={saved ? 'Saved' : 'Unsaved changes'}>
          {saved ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <path d="M20 6L9 17l-5-5"/> 
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/> Unsaved
            </svg>
          )}
        </span>
      </div>
      <textarea
        className={styles.textarea}
        value={content}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
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
