import { useEffect, useCallback, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import styles from './WritingEditor.module.css'
import { useGhostLogic } from '../hooks/useGhostLogic'
import GhostLayer from './GhostLayer'

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
      const words = text.trim() ? text.trim().split(/\s+/).length : 0
      setWordCount(words)
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

  // Load content when project changes
  useEffect(() => {
    if (!editor || !projectId) return
    window.electron.readFile(projectId, 'writing').then(result => {
      if (result.content) {
        editor.commands.setContent(markdownToHtml(result.content))
      } else {
        editor.commands.setContent('')
      }
      setSaved(true)
    })
  }, [projectId, editor])

  // Convert editor content to simple markdown for saving
  function editorToMarkdown(editor) {
    const json = editor.getJSON()
    return jsonToMarkdown(json)
  }

  function jsonToMarkdown(node) {
    if (!node) return ''
    if (node.type === 'doc') {
      return node.content?.map(jsonToMarkdown).join('\n\n') || ''
    }
    if (node.type === 'paragraph') {
      return node.content?.map(inlineToMarkdown).join('') || ''
    }
    if (node.type === 'heading') {
      const hashes = '#'.repeat(node.attrs?.level || 1)
      return `${hashes} ${node.content?.map(inlineToMarkdown).join('') || ''}`
    }
    if (node.type === 'bulletList') {
      return node.content?.map(item => `- ${item.content?.map(jsonToMarkdown).join('')}`).join('\n') || ''
    }
    if (node.type === 'orderedList') {
      return node.content?.map((item, i) => `${i + 1}. ${item.content?.map(jsonToMarkdown).join('')}`).join('\n') || ''
    }
    if (node.type === 'listItem') {
      return node.content?.map(jsonToMarkdown).join('') || ''
    }
    return node.content?.map(inlineToMarkdown).join('') || ''
  }

  function inlineToMarkdown(node) {
    if (!node) return ''
    if (node.type === 'text') {
      let text = node.text || ''
      const marks = node.marks || []
      if (marks.find(m => m.type === 'bold')) text = `**${text}**`
      if (marks.find(m => m.type === 'italic')) text = `*${text}*`
      if (marks.find(m => m.type === 'underline')) text = `<u>${text}</u>`
      return text
    }
    return ''
  }

  // Convert simple markdown to HTML for loading into TipTap
  function markdownToHtml(markdown) {
    if (!markdown) return ''
    let html = markdown
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .split('\n\n')
      .map(block => {
        if (block.startsWith('<h')) return block
        if (block.includes('<li>')) return `<ul>${block}</ul>`
        if (block.trim()) return `<p>${block}</p>`
        return ''
      })
      .filter(Boolean)
      .join('')
    return html
  }

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
      <div className={styles.editorWrap}>
        <EditorContent editor={editor} className={styles.editor} />

        {/* Ghost text layer */}
        <GhostLayer ghosts={ghosts} />
      </div>

      {/* Legend + status bar */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <div className={styles.legendBlock} style={{ background: 'var(--ghost-g-bg)', border: '1px solid var(--ghost-g-text)' }} />
          Covering
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendBlock} style={{ background: 'var(--ghost-o-bg)', border: '1px solid var(--ghost-o-text)' }} />
          Strong
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendBlock} style={{ background: 'var(--ghost-y-bg)', border: '1px solid var(--ghost-y-text)' }} />
          Moderate
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendBlock} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)' }} />
          Not yet
        </div>
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusItem}>
          <div className={styles.statusDot} />
          {coveredCount > 0 ? `${coveredCount} of ${ghosts.length} covered` : `${wordCount} words`}
        </div>
        <div className={styles.statusItem} style={{ marginLeft: 'auto' }}>
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
