import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './BrainDumpEditor.module.css'

export default function BrainDumpEditor({ projectId }) {
  const [dumps, setDumps] = useState([])
  const [activeFile, setActiveFile] = useState('main.md')
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  
  const contentRef = useRef('')
  const savedRef = useRef(true)
  const autoSaveTimer = useRef(null)

  // Keep refs in sync with state
  useEffect(() => { contentRef.current = content }, [content])
  useEffect(() => { savedRef.current = saved }, [saved])

  // Fetch list of dumps
  const fetchDumps = useCallback(async () => {
    if (!projectId) return
    const list = await window.electron.getBrainDumps(projectId)
    setDumps(list)
    return list
  }, [projectId])

  // Load content of active file
  const loadFile = useCallback(async (filename) => {
    if (!projectId) return
    setLoaded(false)
    const result = await window.electron.readFile(projectId, 'braindump', filename)
    const text = result.content || ''
    setContent(text)
    contentRef.current = text
    setSaved(true)
    savedRef.current = true
    setLoaded(true)
  }, [projectId])

  // Initialize: fetch dumps and restore active file
  useEffect(() => {
    if (!projectId) return
    
    async function init() {
      const list = await fetchDumps()
      const savedActive = await window.electron.readFile(projectId, 'active-braindump')
      const active = savedActive.content || 'main.md'
      
      // Ensure the saved active file still exists
      if (list.find(d => d.filename === active)) {
        setActiveFile(active)
        await loadFile(active)
      } else {
        setActiveFile('main.md')
        await loadFile('main.md')
      }
    }
    
    init()
  }, [projectId, fetchDumps, loadFile])

  // Save function
  const doSave = useCallback(async () => {
    if (!projectId || !activeFile) return
    await window.electron.saveFile(projectId, 'braindump', contentRef.current, activeFile)
    setSaved(true)
  }, [projectId, activeFile])

  // Debounced auto-save
  useEffect(() => {
    if (saved || !loaded) return
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      doSave()
    }, 1000)
    return () => clearTimeout(autoSaveTimer.current)
  }, [content, saved, loaded, doSave])

  // Save on unmount or file switch
  useEffect(() => {
    return () => {
      clearTimeout(autoSaveTimer.current)
      if (!savedRef.current && contentRef.current !== undefined && activeFile) {
        window.electron.saveFile(projectId, 'braindump', contentRef.current, activeFile)
      }
    }
  }, [projectId, activeFile])

  async function handleFileSwitch(filename) {
    if (filename === activeFile) return
    
    // Save current file if unsaved
    if (!saved) {
      await doSave()
    }
    
    setActiveFile(filename)
    await loadFile(filename)
    await window.electron.saveFile(projectId, 'active-braindump', filename)
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    
    const result = await window.electron.createBrainDump(projectId, newName.trim())
    if (result.error) {
      alert(result.error)
      return
    }
    
    setNewName('')
    setIsCreating(false)
    await fetchDumps()
    handleFileSwitch(result.filename)
  }

  async function handleDelete(filename, e) {
    e.stopPropagation()
    if (filename === 'main.md') return
    if (!confirm(`Are you sure you want to delete "${filename.replace('.md', '')}"?`)) return
    
    const result = await window.electron.deleteBrainDump(projectId, filename)
    if (result.success) {
      await fetchDumps()
      if (activeFile === filename) {
        handleFileSwitch('main.md')
      }
    }
  }

  function handleChange(e) {
    setContent(e.target.value)
    setSaved(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(content)
  }

  async function handleBlur() {
    if (!saved && loaded) await doSave()
  }

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
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h3>Brain Dumps</h3>
          <button 
            className={styles.addBtn} 
            onClick={() => setIsCreating(true)}
            title="New brain dump"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>

        {isCreating && (
          <form className={styles.createForm} onSubmit={handleCreate}>
            <input
              autoFocus
              type="text"
              placeholder="Name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => !newName && setIsCreating(false)}
            />
          </form>
        )}

        <div className={styles.fileList}>
          {dumps.map(dump => (
            <div 
              key={dump.filename}
              className={`${styles.fileItem} ${activeFile === dump.filename ? styles.active : ''}`}
              onClick={() => handleFileSwitch(dump.filename)}
            >
              <span className={styles.fileName}>{dump.name}</span>
              {dump.filename !== 'main.md' && (
                <button 
                  className={styles.deleteFileBtn}
                  onClick={(e) => handleDelete(dump.filename, e)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.editorArea}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.label}>
              {dumps.find(d => d.filename === activeFile)?.name || 'Brain Dump'}
            </span>
          </div>
          <span className={styles.savedIndicator} title={saved ? 'Saved' : 'Unsaved changes'}>
            {saved ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                <path d="M20 6L9 17l-5-5"/> 
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
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
            When you're done, copy this and paste it into your AI of choice.
          </p>
          <button className={styles.copyBtn} onClick={handleCopy}>
            Copy to clipboard →
          </button>
        </div>
      </div>
    </div>
  )
}
