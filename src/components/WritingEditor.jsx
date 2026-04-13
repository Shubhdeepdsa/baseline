import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import styles from './WritingEditor.module.css'
import { useGhostLogic } from '../hooks/useGhostLogic'
import { useSettings } from '../hooks/useSettings'
import { useSmoothCaret } from '../hooks/useSmoothCaret'
import GhostPane from './GhostPane'
import SmoothCaret from './SmoothCaret'
import { editorToMarkdown, markdownToHtml } from '../utils/tiptapMarkdown'

function countWords(text) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

const SPLIT_DIVIDER_SIZE = 12

function getEmptyVersionState() {
  return { annotations: [], removedSentenceIds: [] }
}

function getVersionGhostState(ghostState, activeVersionFilename) {
  if (!activeVersionFilename) return getEmptyVersionState()
  return ghostState.versions?.[activeVersionFilename] || getEmptyVersionState()
}

function ToolBtn({ onClick, active, children, title }) {
  return (
    <button
      className={`${styles.toolBtn} ${active ? styles.toolBtnActive : ''}`}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

export default function WritingEditor({ projectId, activeVersionFilename, activeVersionContent }) {
  const [wordCount, setWordCount] = useState(0)
  const [saved, setSaved] = useState(true)
  const [ghostState, setGhostState] = useState({ versions: {} })
  const [paneRatio, setPaneRatio] = useState(0.62)
  const saveTimerRef = useRef(null)
  const paneRatioRef = useRef(0.62)
  const editorWrapRef = useRef(null)
  const splitViewRef = useRef(null)
  const { settings, saveSetting } = useSettings()
  const ghostBehavior = settings.ghostBehavior || 'hide'
  const ghostSelectionMode = settings.ghostSelectionMode || 'sentence'
  const ghostSplitOrientation = settings.ghostSplitOrientation || 'horizontal'
  const ghostRemovedVisibility = settings.ghostRemovedVisibility || 'show'
  const ghostSplitRatioHorizontal = settings.ghostSplitRatioHorizontal ?? 0.62
  const ghostSplitRatioVertical = settings.ghostSplitRatioVertical ?? 0.58

  const versionGhostState = useMemo(
    () => getVersionGhostState(ghostState, activeVersionFilename),
    [ghostState, activeVersionFilename]
  )
  const annotations = versionGhostState.annotations || []
  const removedSentenceIds = versionGhostState.removedSentenceIds || []

  const { ghosts, ghostSourceText, embedStatus, processText } = useGhostLogic(activeVersionContent, removedSentenceIds)
  const coveredCount = ghosts.filter(ghost => ghost.covered && !ghost.removed).length
  const visibleGhostCount = ghosts.filter(ghost => !ghost.removed).length

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
      }),
      Underline,
      Placeholder.configure({
        placeholder: 'Start writing here...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: styles.editorContent,
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      const text = nextEditor.getText()
      setWordCount(countWords(text))
      setSaved(false)
      processText(text)

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const markdown = editorToMarkdown(nextEditor)
        window.electron.saveFile(projectId, 'writing', markdown)
        setSaved(true)
      }, 2000)
    },
  })

  const { caret, nativeCaretHidden } = useSmoothCaret(editor, editorWrapRef)

  const persistGhostState = useCallback((nextState) => {
    if (!projectId) return
    window.electron.saveGhostState(projectId, nextState)
  }, [projectId])

  const updateVersionGhostState = useCallback((updater) => {
    if (!activeVersionFilename) return

    setGhostState(prevState => {
      const current = getVersionGhostState(prevState, activeVersionFilename)
      const nextVersionState = updater(current)
      const nextState = {
        ...prevState,
        versions: {
          ...(prevState.versions || {}),
          [activeVersionFilename]: nextVersionState,
        },
      }

      persistGhostState(nextState)
      return nextState
    })
  }, [activeVersionFilename, persistGhostState])

  useEffect(() => {
    if (!projectId) return

    window.electron.readGhostState(projectId).then(state => {
      setGhostState(state?.versions ? state : { versions: {} })
    })
  }, [projectId])

  useEffect(() => {
    const ratioFromSettings = ghostSplitOrientation === 'horizontal'
      ? ghostSplitRatioHorizontal
      : ghostSplitRatioVertical

    setPaneRatio(ratioFromSettings)
    paneRatioRef.current = ratioFromSettings
  }, [ghostSplitOrientation, ghostSplitRatioHorizontal, ghostSplitRatioVertical])

  useEffect(() => {
    paneRatioRef.current = paneRatio
  }, [paneRatio])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!editor || !projectId) return

    window.electron.readFile(projectId, 'writing').then(result => {
      if (result.content) {
        editor.commands.setContent(markdownToHtml(result.content), false)
      } else {
        editor.commands.setContent('', false)
      }

      const text = editor.getText()
      setWordCount(countWords(text))
      setSaved(true)
      processText(text)
    })
  }, [editor, projectId])

  useEffect(() => {
    if (!editor) return
    processText(editor.getText())
  }, [editor, processText, activeVersionContent, removedSentenceIds])

  const handleAnnotationsChange = useCallback((nextAnnotations) => {
    updateVersionGhostState(current => ({
      ...current,
      annotations: nextAnnotations,
    }))
  }, [updateVersionGhostState])

  const handleRemoveSentences = useCallback((sentenceIds) => {
    updateVersionGhostState(current => ({
      ...current,
      removedSentenceIds: [...new Set([...(current.removedSentenceIds || []), ...sentenceIds])],
    }))
  }, [updateVersionGhostState])

  const handleSplitDragStart = (event) => {
    if (!splitViewRef.current) return

    event.preventDefault()

    const handleMouseMove = (moveEvent) => {
      if (!splitViewRef.current) return

      const rect = splitViewRef.current.getBoundingClientRect()
      const usableSize = ghostSplitOrientation === 'horizontal'
        ? rect.height - SPLIT_DIVIDER_SIZE
        : rect.width - SPLIT_DIVIDER_SIZE
      const pointerOffset = ghostSplitOrientation === 'horizontal'
        ? moveEvent.clientY - rect.top - SPLIT_DIVIDER_SIZE / 2
        : moveEvent.clientX - rect.left - SPLIT_DIVIDER_SIZE / 2
      const rawRatio = usableSize <= 0 ? paneRatioRef.current : pointerOffset / usableSize

      const nextRatio = clamp(rawRatio, 0.2, 0.8)
      setPaneRatio(nextRatio)
      paneRatioRef.current = nextRatio
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)

      const settingKey = ghostSplitOrientation === 'horizontal'
        ? 'ghostSplitRatioHorizontal'
        : 'ghostSplitRatioVertical'

      saveSetting(settingKey, paneRatioRef.current)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  async function handleExport(format) {
    if (!editor) return

    const markdown = editorToMarkdown(editor)

    function arrayBufferToBase64(buffer) {
      let binary = ''
      const bytes = new Uint8Array(buffer)
      const len = bytes.byteLength
      for (let index = 0; index < len; index += 1) {
        binary += String.fromCharCode(bytes[index])
      }
      return btoa(binary)
    }

    if (format === 'md') {
      await window.electron.exportFile(projectId, 'md', markdown)
      return
    }

    if (format === 'pdf') {
      const { exportToPDF } = await import('../utils/exporters')
      const arrayBuffer = await exportToPDF(editor.getHTML(), projectId)
      const base64 = arrayBufferToBase64(arrayBuffer)
      await window.electron.exportFile(projectId, 'pdf', base64)
      return
    }

    if (format === 'docx') {
      const { exportToDocx } = await import('../utils/exporters')
      const arrayBuffer = await exportToDocx(markdown, projectId)
      const base64 = arrayBufferToBase64(arrayBuffer)
      await window.electron.exportFile(projectId, 'docx', base64)
    }
  }

  if (!editor) return null

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <strong>B</strong>
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <em>I</em>
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Underline"
        >
          <span style={{ textDecoration: 'underline' }}>U</span>
        </ToolBtn>

        <div className={styles.sep} />

        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          H1
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          H2
        </ToolBtn>

        <div className={styles.sep} />

        <ToolBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet list"
        >
          •—
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered list"
        >
          1.
        </ToolBtn>

        <div className={styles.exportGroup}>
          <span className={styles.exportLabel}>Export</span>
          <button className={styles.exportBtn} onClick={() => handleExport('md')} title="Export as Markdown">.md</button>
          <button className={styles.exportBtn} onClick={() => handleExport('pdf')} title="Export as PDF">.pdf</button>
          <button className={styles.exportBtn} onClick={() => handleExport('docx')} title="Export as Word">.docx</button>
        </div>
      </div>

      <div
        ref={splitViewRef}
        className={`${styles.splitView} ${ghostSplitOrientation === 'horizontal' ? styles.splitHorizontal : styles.splitVertical}`}
        style={{
          '--pane-ratio': String(paneRatio),
          '--pane-ratio-inverse': String(1 - paneRatio),
          '--split-divider-size': `${SPLIT_DIVIDER_SIZE}px`,
        }}
      >
        <div
          className={styles.pane}
        >
          <div
            ref={editorWrapRef}
            className={`${styles.editorWrap} ${nativeCaretHidden ? styles.editorWrapSmoothCaret : ''}`}
          >
            <EditorContent editor={editor} className={styles.editor} />
            <SmoothCaret caret={caret} />
          </div>
        </div>

        <div
          className={`${styles.divider} ${ghostSplitOrientation === 'horizontal' ? styles.dividerHorizontal : styles.dividerVertical}`}
          onMouseDown={handleSplitDragStart}
        >
          <div className={styles.dividerGrip} />
        </div>

        <div className={`${styles.pane} ${styles.ghostPaneWrap}`}>
          <GhostPane
            ghosts={ghosts}
            ghostSourceText={ghostSourceText}
            behavior={ghostBehavior}
            selectionMode={ghostSelectionMode}
            removedVisibility={ghostRemovedVisibility}
            annotations={annotations}
            onAnnotationsChange={handleAnnotationsChange}
            onRemoveSentences={handleRemoveSentences}
          />
        </div>
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusMeta}>
          <div className={styles.statusItem}>
            <div className={styles.statusDot} />
            {ghosts.length > 0 ? `${coveredCount} of ${visibleGhostCount} covered` : 'Ghost tracking idle'}
          </div>

          <div className={styles.statusSep} />

          <div className={styles.statusItem}>
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </div>

          <div className={styles.statusSep} />

          <div className={styles.legend}>
            <div className={styles.legendItem} title="High overlap">
              <div className={styles.legendBlock} style={{ background: 'var(--ghost-g-bg)', border: '1px solid var(--ghost-g-text)' }} />
              Covering
            </div>
            <div className={styles.legendItem} title="Strong overlap">
              <div className={styles.legendBlock} style={{ background: 'var(--ghost-o-bg)', border: '1px solid var(--ghost-o-text)' }} />
              Strong
            </div>
            <div className={styles.legendItem} title="Moderate overlap">
              <div className={styles.legendBlock} style={{ background: 'var(--ghost-y-bg)', border: '1px solid var(--ghost-y-text)' }} />
              Moderate
            </div>
            <div className={styles.legendItem} title="Not yet addressed">
              <div className={styles.legendBlock} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)' }} />
              Not yet
            </div>
          </div>

          <div className={styles.statusSep} />

          <div className={styles.statusItem}>
            {embedStatus === 'loading' && <span className={styles.badge}>Loading model...</span>}
            {embedStatus === 'ready' && <span className={styles.badge}>MiniLM ready</span>}
            {embedStatus.startsWith('error') && <span style={{ color: '#E24B4A', fontSize: 10 }}>{embedStatus}</span>}
          </div>
          <div className={styles.statusItem}>
            {saved ? 'Saved' : 'Saving...'}
          </div>
        </div>

        <div className={styles.statusControls}>
          <div className={styles.behaviorToggle}>
            <span className={styles.behaviorLabel}>Layout</span>
            <button
              className={`${styles.behaviorBtn} ${ghostSplitOrientation === 'horizontal' ? styles.behaviorBtnActive : ''}`}
              onClick={() => saveSetting('ghostSplitOrientation', 'horizontal')}
              title="Stack writing above ghost text"
            >
              Horizontal
            </button>
            <button
              className={`${styles.behaviorBtn} ${ghostSplitOrientation === 'vertical' ? styles.behaviorBtnActive : ''}`}
              onClick={() => saveSetting('ghostSplitOrientation', 'vertical')}
              title="Place writing beside ghost text"
            >
              Vertical
            </button>
          </div>

          <div className={styles.behaviorToggle}>
            <span className={styles.behaviorLabel}>After covering</span>
            <button
              className={`${styles.behaviorBtn} ${ghostBehavior === 'hide' ? styles.behaviorBtnActive : ''}`}
              onClick={() => saveSetting('ghostBehavior', 'hide')}
              title="Hide covered ghost text"
            >
              Hide
            </button>
            <button
              className={`${styles.behaviorBtn} ${ghostBehavior === 'strike' ? styles.behaviorBtnActive : ''}`}
              onClick={() => saveSetting('ghostBehavior', 'strike')}
              title="Strike-through covered ghost text"
            >
              Strike
            </button>
            <button
              className={`${styles.behaviorBtn} ${ghostBehavior === 'none' ? styles.behaviorBtnActive : ''}`}
              onClick={() => saveSetting('ghostBehavior', 'none')}
              title="Leave covered ghost text visible"
            >
              Stay
            </button>
          </div>

          <div className={styles.behaviorToggle}>
            <span className={styles.behaviorLabel}>Removed</span>
            <button
              className={`${styles.behaviorBtn} ${ghostRemovedVisibility === 'show' ? styles.behaviorBtnActive : ''}`}
              onClick={() => saveSetting('ghostRemovedVisibility', 'show')}
              title="Show removed ghost text with strike-through"
            >
              Show
            </button>
            <button
              className={`${styles.behaviorBtn} ${ghostRemovedVisibility === 'hide' ? styles.behaviorBtnActive : ''}`}
              onClick={() => saveSetting('ghostRemovedVisibility', 'hide')}
              title="Hide removed ghost text"
            >
              Hide
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
