import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WritingEditor from './WritingEditor'
import styles from './WritingWorkspace.module.css'

const defaultDocLabel = 'Untitled document'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function formatUpdatedAt(iso) {
  if (!iso) return 'Never saved'
  try {
    return dateFormatter.format(new Date(iso))
  } catch {
    return 'Unknown date'
  }
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightTokens(text, tokens = []) {
  if (!tokens.length) return [text]
  const pattern = tokens
    .map(token => escapeForRegex(token))
    .filter(Boolean)
    .join('|')
  if (!pattern) return [text]
  const regex = new RegExp(pattern, 'gi')
  const segments = []
  let lastIndex = 0
  let match
  let key = 0
  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index))
    }
    segments.push(<strong key={key++}>{match[0]}</strong>)
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex))
  }
  return segments
}

export default function WritingWorkspace({
  projectId,
  activeVersionFilename,
  activeVersionContent,
  settings,
  saveSetting,
}) {
  const [documents, setDocuments] = useState([])
  const [activeDoc, setActiveDoc] = useState(null)
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [pickerName, setPickerName] = useState('')
  const [pickerError, setPickerError] = useState('')
  const [paletteError, setPaletteError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const pickerInputRef = useRef(null)
  const paletteInputRef = useRef(null)
  const renameInputRef = useRef(null)
  const [focusKey, setFocusKey] = useState(0)

  const refreshDocs = useCallback(async () => {
    if (!projectId) {
      setDocuments([])
      setLoadingDocs(false)
      return
    }

    setLoadingDocs(true)
    const list = await window.electron.getWritingDocs(projectId)
    setDocuments(list)
    setLoadingDocs(false)
  }, [projectId])

  useEffect(() => {
    refreshDocs()
    setActiveDoc(null)
  }, [projectId, refreshDocs])

  useEffect(() => {
    if (!activeDoc || documents.length === 0) return
    const match = documents.find(doc => doc.filename === activeDoc.filename)
    if (match && match.updatedAt !== activeDoc.updatedAt) {
      setActiveDoc(match)
    }
  }, [documents, activeDoc])

  const sortedDocs = useMemo(() => {
    const lastFilename = settings?.lastWritingDoc
    if (!lastFilename) return documents
    const index = documents.findIndex(doc => doc.filename === lastFilename)
    if (index <= 0) return documents
    const reordered = [...documents]
    const [found] = reordered.splice(index, 1)
    reordered.unshift(found)
    return reordered
  }, [documents, settings?.lastWritingDoc])

  const searchTokens = useMemo(() => {
    return searchTerm
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(token => token.toLowerCase())
  }, [searchTerm])

  const filteredDocs = useMemo(() => {
    if (!searchTokens.length) return sortedDocs
    return sortedDocs.filter(doc =>
      searchTokens.every(token => doc.name.toLowerCase().includes(token))
    )
  }, [sortedDocs, searchTokens])

  const paletteItems = useMemo(() => {
    const createLabel = searchTerm.trim() || defaultDocLabel
    const entries = [
      {
        type: 'create',
        label: `Create new document "${createLabel}"`,
      },
      ...filteredDocs.map(doc => ({ type: 'doc', doc })),
    ]
    return entries
  }, [filteredDocs, searchTerm])

  const requestEditorFocus = useCallback(() => {
    setFocusKey(prev => prev + 1)
  }, [])

  const selectDoc = useCallback((doc) => {
    setActiveDoc(doc)
    setPaletteOpen(false)
    requestEditorFocus()
    saveSetting?.('lastWritingDoc', doc.filename)
  }, [requestEditorFocus, saveSetting])

  useEffect(() => {
    if (activeDoc) {
      setRenameValue(activeDoc.name)
      setRenameError('')
    }
  }, [activeDoc])

  const createDocument = useCallback(async (name, source) => {
    if (!projectId) return
    const docName = name?.trim() || defaultDocLabel
    const result = await window.electron.createWritingDoc(projectId, docName)
    if (result?.error) {
      if (source === 'palette') {
        setPaletteError(result.error)
      } else {
        setPickerError(result.error)
      }
      return null
    }

    setPickerError('')
    setPaletteError('')
    await refreshDocs()
    const doc = {
      filename: result.filename,
      name: result.name,
      preview: result.preview,
      updatedAt: result.updatedAt,
    }
    setActiveDoc(doc)
    requestEditorFocus()
    saveSetting?.('lastWritingDoc', result.filename)

    if (source === 'palette') {
      setSearchTerm('')
      setPaletteOpen(false)
    }

    if (source === 'picker') {
      setPickerName('')
    }

    return doc
  }, [projectId, refreshDocs])

  const handlePickerCreate = useCallback(() => {
    setPickerError('')
    createDocument(pickerName, 'picker')
  }, [pickerName, createDocument])

  const handlePaletteCreate = useCallback(() => {
    setPaletteError('')
    createDocument(searchTerm, 'palette')
  }, [searchTerm, createDocument])

  const openPalette = useCallback(() => {
    setSearchTerm('')
    setPaletteOpen(true)
  }, [])

  const handleRenameSubmit = useCallback(async () => {
    if (!activeDoc || !projectId) return
    const finalName = renameValue.trim()
    if (!finalName) {
      setIsRenaming(false)
      setRenameValue(activeDoc.name)
      return
    }

    const result = await window.electron.renameWritingDoc(projectId, activeDoc.filename, finalName)
    if (result?.error) {
      setRenameError(result.error)
      return
    }

    setRenameError('')
    await refreshDocs()
    const updatedDoc = {
      filename: result.filename,
      name: result.name,
      preview: result.preview,
      updatedAt: result.updatedAt,
    }
    setActiveDoc(updatedDoc)
    setIsRenaming(false)
    saveSetting?.('lastWritingDoc', result.filename)
  }, [activeDoc, projectId, refreshDocs, renameValue])

  const handleRenameCancel = useCallback(() => {
    setIsRenaming(false)
    if (activeDoc) setRenameValue(activeDoc.name)
    setRenameError('')
  }, [activeDoc])

  const handleRenameKeydown = useCallback((event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleRenameSubmit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      handleRenameCancel()
    }
  }, [handleRenameSubmit, handleRenameCancel])

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus()
    }
  }, [isRenaming])

  const handleKeydown = useCallback((event) => {
    if (!projectId) return
    const isMac = window.electron?.platform === 'darwin'
    const modifier = isMac ? event.metaKey : event.ctrlKey
    if (!modifier || !event.shiftKey) return
    if (event.key.toLowerCase() !== 'o') return
    event.preventDefault()
    openPalette()
  }, [projectId, openPalette])

  useEffect(() => {
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [handleKeydown])

  useEffect(() => {
    if (!paletteOpen) return
    const listener = (event) => {
      if (event.key === 'Escape') {
        setPaletteOpen(false)
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setFocusedIndex(prev => {
          const maxIndex = paletteItems.length - 1
          if (event.key === 'ArrowDown') {
            return prev >= maxIndex ? 0 : prev + 1
          }
          return prev <= 0 ? maxIndex : prev - 1
        })
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const entry = paletteItems[focusedIndex]
        if (!entry) return
        if (entry.type === 'create') {
          handlePaletteCreate()
        } else {
          selectDoc(entry.doc)
        }
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [paletteOpen, paletteItems, focusedIndex, handlePaletteCreate, selectDoc])

  useEffect(() => {
    if (paletteOpen) {
      requestAnimationFrame(() => {
        paletteInputRef.current?.focus()
      })
    }
  }, [paletteOpen])

  useEffect(() => {
    if (!paletteOpen) return
    const defaultIndex = filteredDocs.length > 0 ? 1 : 0
    setFocusedIndex(defaultIndex)
  }, [paletteOpen, filteredDocs.length])

  useEffect(() => {
    setFocusedIndex(prev => {
      const maxIndex = paletteItems.length - 1
      if (prev > maxIndex) return Math.max(0, maxIndex)
      return prev
    })
  }, [paletteItems.length])

  if (!projectId) {
    return <div className={styles.emptyState}>Select a project to unlock writing.</div>
  }

  return (
    <div className={styles.workspace}>
      {activeDoc ? (
        <>
          <div className={styles.editorHeader}>
            <div>
              <p className={styles.editorLabel}>Main writing document</p>
              <div className={styles.titleRow}>
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className={styles.renameInput}
                    value={renameValue}
                    onChange={event => setRenameValue(event.target.value)}
                    onKeyDown={handleRenameKeydown}
                    onBlur={handleRenameCancel}
                    aria-label="Rename document"
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.documentTitleButton}
                    onClick={() => setIsRenaming(true)}
                  >
                    {activeDoc.name}
                  </button>
                )}
                <span className={styles.documentMeta}>Last updated {formatUpdatedAt(activeDoc.updatedAt)}</span>
              </div>
              {renameError && <div className={styles.renameError}>{renameError}</div>}
            </div>
            <div className={styles.headerActions}>
              <button className={styles.smallAction} type="button" onClick={openPalette}>
                Open document list
              </button>
            </div>
          </div>
          <WritingEditor
            projectId={projectId}
            activeVersionFilename={activeVersionFilename}
            activeVersionContent={activeVersionContent}
            settings={settings}
            saveSetting={saveSetting}
            activeDocument={activeDoc}
            focusKey={focusKey}
          />
        </>
      ) : (
        <div className={styles.picker}>
          <div className={styles.pickerIntro}>
            <div>
              <p className={styles.pickerLabel}>Main writing section</p>
              <h2 className={styles.pickerTitle}>Choose a document to edit</h2>
              <p className={styles.pickerSubtitle}>
                Everything you type here is stored per document. Open this list anytime with <strong>⌘⇧O</strong>.
              </p>
            </div>
            <button
              className={styles.createHint}
              type="button"
              onClick={() => pickerInputRef.current?.focus()}
            >
              + New document
            </button>
          </div>
          <div className={styles.createRow}>
            <input
              ref={pickerInputRef}
              className={styles.createInput}
              value={pickerName}
              onChange={event => {
                setPickerName(event.target.value)
                if (pickerError) setPickerError('')
              }}
              placeholder={defaultDocLabel}
              aria-label="New document name"
            />
            <button className={styles.createAction} type="button" onClick={handlePickerCreate}>
              Create
            </button>
          </div>
          {pickerError && <div className={styles.error}>{pickerError}</div>}
          {loadingDocs ? (
            <div className={styles.emptyState}>Loading documents…</div>
          ) : documents.length === 0 ? (
            <div className={styles.emptyState}>There are no documents yet. Create one above.</div>
          ) : (
            <div className={styles.cardGrid}>
              {documents.map(doc => (
                <button
                  key={doc.filename}
                  type="button"
                  className={styles.card}
                  onClick={() => selectDoc(doc)}
                >
                  <div className={styles.cardTitle}>{doc.name}</div>
                  <p className={styles.cardPreview}>
                    {doc.preview || 'No content yet — start writing to see a preview.'}
                  </p>
                  <div className={styles.cardMeta}>
                    <span>{formatUpdatedAt(doc.updatedAt)}</span>
                    <span className={styles.cardTag}>{doc.filename === 'main.md' ? 'Main' : 'Draft'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {paletteOpen && (
        <div className={styles.paletteBackdrop} onClick={() => setPaletteOpen(false)}>
          <div className={styles.palette} onClick={event => event.stopPropagation()}>
            <div className={styles.paletteHeader}>
              <div className={styles.paletteHeaderText}>
                <p className={styles.paletteLabel}>Open document</p>
                <span className={styles.paletteShortcutLabel}>(⌘⇧O)</span>
              </div>
              <button className={styles.closeIcon} type="button" onClick={() => setPaletteOpen(false)}>
                ×
              </button>
            </div>
            <input
              ref={paletteInputRef}
              className={styles.paletteSearch}
              value={searchTerm}
              onChange={event => {
                setSearchTerm(event.target.value)
              }}
              placeholder="Search documents…"
              aria-label="Search writing documents"
            />
            <div className={styles.paletteList}>
              {paletteItems.map((entry, index) => {
                const isFocused = index === focusedIndex
                if (entry.type === 'create') {
                  return (
                    <button
                      key="create"
                      type="button"
                      className={`${styles.paletteItem} ${styles.paletteItemCreate} ${isFocused ? styles.paletteItemFocused : ''}`}
                      onClick={handlePaletteCreate}
                    >
                      <div className={styles.paletteEntryText}>{entry.label}</div>
                    </button>
                  )
                }

                return (
                  <button
                    key={entry.doc.filename}
                    type="button"
                    className={`${styles.paletteItem} ${isFocused ? styles.paletteItemFocused : ''}`}
                    onClick={() => selectDoc(entry.doc)}
                  >
                    <div className={styles.paletteEntryText}>
                      {highlightTokens(entry.doc.name, searchTokens)}
                    </div>
                    <span className={styles.paletteItemMeta}>{formatUpdatedAt(entry.doc.updatedAt)}</span>
                  </button>
                )
              })}
            </div>
            {paletteError && <div className={styles.error}>{paletteError}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
