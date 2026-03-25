import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import styles from './BrainDumpEditor.module.css'
import { editorToMarkdown, markdownToHtml } from '../utils/tiptapMarkdown'
import {
  brainDumpNameFromFilename,
  findBrainDumpAutocompleteMatch,
  resolveBrainDumpLink,
} from '../utils/brainDumpLinks'
import { createWikiLinkExtension, WIKI_LINK_REFRESH_META } from '../utils/wikiLinkExtension'

export default function BrainDumpEditor({ projectId }) {
  const [dumps, setDumps] = useState([])
  const [activeFile, setActiveFile] = useState('main.md')
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [autocomplete, setAutocomplete] = useState(null)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)

  const contentRef = useRef('')
  const savedRef = useRef(true)
  const loadedRef = useRef(false)
  const dumpsRef = useRef([])
  const linkNavigateRef = useRef(null)
  const autoSaveTimer = useRef(null)
  const wikiLinkExtensionRef = useRef(null)
  const editorWrapRef = useRef(null)

  if (!wikiLinkExtensionRef.current) {
    wikiLinkExtensionRef.current = createWikiLinkExtension({
      resolveLink: (label) => resolveBrainDumpLink(label, dumpsRef.current),
      onNavigate: (filename) => linkNavigateRef.current?.(filename),
    })
  }

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    savedRef.current = saved
  }, [saved])

  useEffect(() => {
    loadedRef.current = loaded
  }, [loaded])

  useEffect(() => {
    dumpsRef.current = dumps
  }, [dumps])

  const dumpOrder = useMemo(() => {
    return new Map(dumps.map((dump, index) => [dump.filename, index]))
  }, [dumps])

  const dumpFuse = useMemo(() => {
    return new Fuse(dumps, {
      keys: ['name'],
      threshold: 0.4,
      distance: 100,
      ignoreLocation: true,
      includeScore: true,
    })
  }, [dumps])

  const autocompleteSuggestions = useMemo(() => {
    if (!autocomplete) return []

    const query = autocomplete.query.trim()
    if (!query) return dumps

    return dumpFuse
      .search(query)
      .sort((a, b) => {
        if ((a.score ?? 0) !== (b.score ?? 0)) {
          return (a.score ?? 0) - (b.score ?? 0)
        }

        return (dumpOrder.get(a.item.filename) ?? 0) - (dumpOrder.get(b.item.filename) ?? 0)
      })
      .map(result => result.item)
  }, [autocomplete, dumpFuse, dumpOrder, dumps])

  useEffect(() => {
    if (autocompleteSuggestions.length === 0) {
      setSelectedSuggestionIndex(0)
      return
    }

    setSelectedSuggestionIndex(prev => Math.min(prev, autocompleteSuggestions.length - 1))
  }, [autocompleteSuggestions])

  const syncAutocomplete = useCallback((currentEditor) => {
    if (!currentEditor || !editorWrapRef.current) {
      setAutocomplete(null)
      return
    }

    const match = findBrainDumpAutocompleteMatch(currentEditor)
    if (!match) {
      setAutocomplete(null)
      return
    }

    const wrapRect = editorWrapRef.current.getBoundingClientRect()
    const coords = currentEditor.view.coordsAtPos(currentEditor.state.selection.from)
    const rawLeft = coords.left - wrapRect.left + editorWrapRef.current.scrollLeft
    const maxLeft = Math.max(editorWrapRef.current.scrollLeft + editorWrapRef.current.clientWidth - 304, 16)
    const left = Math.max(16, Math.min(rawLeft, maxLeft))
    const top = coords.bottom - wrapRect.top + editorWrapRef.current.scrollTop + 8

    setAutocomplete(prev => {
      const next = {
        ...match,
        left,
        top,
      }

      if (!prev || prev.query !== match.query || prev.trigger !== match.trigger || prev.from !== match.from) {
        setSelectedSuggestionIndex(0)
      }

      return next
    })
  }, [])

  const doSave = useCallback(async () => {
    if (!projectId || !activeFile) return

    await window.electron.saveFile(projectId, 'braindump', contentRef.current, activeFile)
    setSaved(true)
    savedRef.current = true
  }, [projectId, activeFile])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
      }),
      Underline,
      wikiLinkExtensionRef.current,
      Placeholder.configure({
        placeholder: 'Write anything here. Broken English, bullet points, half-sentences — whatever gets the idea out. This is just for you.',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: styles.editorContent,
        spellcheck: 'false',
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = editorToMarkdown(editor)

      setContent(markdown)
      contentRef.current = markdown
      setSaved(false)
      savedRef.current = false
      syncAutocomplete(editor)
    },
    onSelectionUpdate: ({ editor }) => {
      syncAutocomplete(editor)
    },
    onBlur: () => {
      setAutocomplete(null)
    },
  })

  const insertAutocompleteSuggestion = useCallback((dump) => {
    if (!editor || !autocomplete || !dump) return

    editor
      .chain()
      .focus()
      .insertContentAt({ from: autocomplete.from, to: autocomplete.to }, `[[${dump.name}]] `)
      .run()

    setAutocomplete(null)
    setSelectedSuggestionIndex(0)
  }, [autocomplete, editor])

  const fetchDumps = useCallback(async () => {
    if (!projectId) return []

    const list = await window.electron.getBrainDumps(projectId)
    setDumps(list)
    return list
  }, [projectId])

  const loadFile = useCallback(async (filename) => {
    if (!projectId) return

    setLoaded(false)
    loadedRef.current = false

    const result = await window.electron.readFile(projectId, 'braindump', filename)
    const text = result.content || ''

    if (editor) {
      editor.commands.setContent(markdownToHtml(text), false)
    }

    setContent(text)
    contentRef.current = text
    setSaved(true)
    savedRef.current = true
    setLoaded(true)
    loadedRef.current = true
  }, [projectId, editor])

  useEffect(() => {
    if (!editor) return

    editor.commands.setContent(markdownToHtml(contentRef.current), false)
  }, [editor])

  useEffect(() => {
    if (!editor) return

    syncAutocomplete(editor)
  }, [editor, syncAutocomplete])

  useEffect(() => {
    if (!editor) return

    editor.view.dispatch(editor.state.tr.setMeta(WIKI_LINK_REFRESH_META, Date.now()))
  }, [editor, dumps])

  useEffect(() => {
    if (!projectId) return

    async function init() {
      const list = await fetchDumps()
      const savedActive = await window.electron.readFile(projectId, 'active-braindump')
      const active = savedActive.content || 'main.md'

      if (list.find(dump => dump.filename === active)) {
        setActiveFile(active)
        await loadFile(active)
      } else {
        setActiveFile('main.md')
        await loadFile('main.md')
      }
    }

    init()
  }, [projectId, fetchDumps, loadFile])

  useEffect(() => {
    if (saved || !loaded) return

    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      doSave()
    }, 1000)

    return () => clearTimeout(autoSaveTimer.current)
  }, [content, saved, loaded, doSave])

  useEffect(() => {
    return () => {
      clearTimeout(autoSaveTimer.current)

      if (!savedRef.current && contentRef.current !== undefined && activeFile) {
        window.electron.saveFile(projectId, 'braindump', contentRef.current, activeFile)
      }
    }
  }, [projectId, activeFile])

  const handleFileSwitch = useCallback(async (filename) => {
    if (filename === activeFile) return

    if (!savedRef.current && loadedRef.current) {
      await doSave()
    }

    setActiveFile(filename)
    await loadFile(filename)
    await window.electron.saveFile(projectId, 'active-braindump', filename)
  }, [activeFile, doSave, loadFile, projectId])

  useEffect(() => {
    linkNavigateRef.current = async (filename) => {
      await handleFileSwitch(filename)
    }
  }, [handleFileSwitch])

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
    await handleFileSwitch(result.filename)
  }

  async function handleDelete(filename, e) {
    e.stopPropagation()
    if (filename === 'main.md') return
    if (!confirm(`Are you sure you want to delete "${filename.replace('.md', '')}"?`)) return

    const result = await window.electron.deleteBrainDump(projectId, filename)
    if (result.success) {
      await fetchDumps()
      if (activeFile === filename) {
        await handleFileSwitch('main.md')
      }
    }
  }

  async function handleRename(filename, e) {
    e.stopPropagation()
    if (filename === 'main.md') return

    const currentName = dumps.find(dump => dump.filename === filename)?.name || brainDumpNameFromFilename(filename)
    const nextName = prompt('Rename brain dump', currentName)

    if (nextName === null) return

    const trimmed = nextName.trim()
    if (!trimmed || trimmed === currentName) return

    const confirmed = confirm(
      `Rename "${currentName}" to "${trimmed}" and update matching wiki links across this project?`,
    )

    if (!confirmed) return

    if (!savedRef.current && loadedRef.current) {
      await doSave()
    }

    const result = await window.electron.renameBrainDump(projectId, filename, trimmed)
    if (result.error) {
      alert(result.error)
      return
    }

    await fetchDumps()

    const nextActiveFile = activeFile === filename ? result.filename : activeFile
    if (activeFile === filename) {
      setActiveFile(result.filename)
    }

    await loadFile(nextActiveFile)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(contentRef.current)
  }

  async function handleBlur() {
    setAutocomplete(null)

    if (savedRef.current || !loadedRef.current) {
      return
    }

    await doSave()
  }

  async function handleKeyDown(e) {
    if (autocomplete) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (autocompleteSuggestions.length > 0) {
          setSelectedSuggestionIndex(prev => (prev + 1) % autocompleteSuggestions.length)
        }
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (autocompleteSuggestions.length > 0) {
          setSelectedSuggestionIndex(prev => (prev - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length)
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        setAutocomplete(null)
        setSelectedSuggestionIndex(0)
        return
      }

      if (e.key === 'Tab' || e.key === 'Enter') {
        if (autocompleteSuggestions.length > 0) {
          e.preventDefault()
          insertAutocompleteSuggestion(autocompleteSuggestions[selectedSuggestionIndex])
          return
        }
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (!savedRef.current && loadedRef.current) {
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
                <div className={styles.fileActions}>
                  <button
                    className={styles.fileActionBtn}
                    onClick={(e) => handleRename(dump.filename, e)}
                    title="Rename brain dump"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"></path>
                    </svg>
                  </button>
                  <button
                    className={styles.fileActionBtn}
                    onClick={(e) => handleDelete(dump.filename, e)}
                    title="Delete brain dump"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.editorArea}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.label}>
              {dumps.find(dump => dump.filename === activeFile)?.name || 'Brain Dump'}
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

        <div
          className={styles.editorWrap}
          ref={editorWrapRef}
          onScroll={() => {
            if (editor) syncAutocomplete(editor)
          }}
        >
          <EditorContent
            editor={editor}
            className={styles.editor}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
          {autocomplete && (
            <div
              className={styles.autocomplete}
              style={{ top: autocomplete.top, left: autocomplete.left }}
            >
              {autocompleteSuggestions.length > 0 ? (
                autocompleteSuggestions.map((dump, index) => (
                  <button
                    key={dump.filename}
                    type="button"
                    className={`${styles.autocompleteItem} ${index === selectedSuggestionIndex ? styles.autocompleteItemActive : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      insertAutocompleteSuggestion(dump)
                    }}
                  >
                    <span className={styles.autocompleteName}>{dump.name}</span>
                    <span className={styles.autocompleteMeta}>{dump.filename.replace('.md', '')}</span>
                  </button>
                ))
              ) : (
                <div className={styles.autocompleteEmpty}>No brain dumps match</div>
              )}
            </div>
          )}
        </div>

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
