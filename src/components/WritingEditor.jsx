import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import styles from './WritingEditor.module.css'
import { useGhostLogic } from '../hooks/useGhostLogic'
import { useSettings } from '../hooks/useSettings'
import { useSmoothCaret } from '../hooks/useSmoothCaret'
import GhostLayer from './GhostLayer'
import SmoothCaret from './SmoothCaret'
import { editorToMarkdown, markdownToHtml } from '../utils/tiptapMarkdown'

function countWords(text) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

// Toolbar button component
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

export default function WritingEditor({ projectId, activeVersionContent }) {
  const [wordCount, setWordCount] = useState(0)
  const [saved, setSaved] = useState(true)
  const [saveTimer, setSaveTimer] = useState(null)
  const editorWrapRef = useRef(null)
  const { settings, saveSetting } = useSettings()
  const ghostBehavior = settings.ghostBehavior || 'hide' // default

  const { ghosts, embedStatus, processText } = useGhostLogic(activeVersionContent)
  const coveredCount = ghosts.filter(g => g.covered).length

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
    onUpdate: ({ editor }) => {
      const text = editor.getText()
      setWordCount(countWords(text))
      setSaved(false)

      // Ghost text processing
      processText(text)

      // Debounced auto-save every 2 seconds
      setSaveTimer(prev => {
        if (prev) clearTimeout(prev)
        return setTimeout(() => {
          const markdown = editorToMarkdown(editor)
          window.electron.saveFile(projectId, 'writing', markdown)
          setSaved(true)
        }, 2000)
      })
    },
  })

  const { caret, nativeCaretHidden } = useSmoothCaret(editor, editorWrapRef)

  // Load content when project changes
  useEffect(() => {
    if (!editor || !projectId) return
    window.electron.readFile(projectId, 'writing').then(result => {
      if (result.content) {
        editor.commands.setContent(markdownToHtml(result.content), false)
      } else {
        editor.commands.setContent('', false)
      }
      setWordCount(countWords(editor.getText()))
      setSaved(true)
    })
  }, [projectId, editor])

  async function handleExport(format) {
    if (!editor) return

    const markdown = editorToMarkdown(editor)

    function arrayBufferToBase64(buffer) {
      let binary = ''
      const bytes = new Uint8Array(buffer)
      const len = bytes.byteLength
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
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
      return
    }
  }

  if (!editor) return null

  return (
    <div className={styles.container}>
      {/* Toolbar */}
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

      {/* Editor area */}
      <div
        ref={editorWrapRef}
        className={`${styles.editorWrap} ${nativeCaretHidden ? styles.editorWrapSmoothCaret : ''}`}
      >
        <EditorContent editor={editor} className={styles.editor} />
        <SmoothCaret caret={caret} />

        {/* Ghost text layer */}
        <GhostLayer ghosts={ghosts} behavior={ghostBehavior} />
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusItem}>
          <div className={styles.statusDot} />
          {ghosts.length > 0 ? `${coveredCount} of ${ghosts.length} covered` : 'Ghost tracking idle'}
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

        <div className={styles.statusSpacer} />

        <div className={styles.behaviorToggle}>
          <span className={styles.behaviorLabel}>After covering:</span>
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
    </div>
  )
}
