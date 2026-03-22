# Baseline — Phase 4: Writing Editor (TipTap)

## What this phase produces
The Writing tab has a fully working WYSIWYG editor built on TipTap. The user writes in formatted text (bold, italic, headings, bullets) and never sees raw markdown. Content saves to `writing.md` on disk automatically. Ghost text placeholder is shown below the cursor but is not yet functional (that's Phase 5).

## End state checklist
- [ ] TipTap editor renders in Writing tab
- [ ] Bold, italic, underline work via toolbar buttons
- [ ] H1, H2 work via toolbar
- [ ] Bullet list and numbered list work
- [ ] Content auto-saves to writing.md on disk
- [ ] Switching projects loads the correct content
- [ ] Ghost text area visible below cursor (static placeholder for now)
- [ ] Word count shown in status bar

---

## Step 1 — Install TipTap

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-placeholder
```

---

## Step 2 — Create the WritingEditor component

Create `src/components/WritingEditor.jsx`:

```jsx
import { useEffect, useCallback, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import styles from './WritingEditor.module.css'

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
    await window.electron.exportFile(projectId, format, markdown)
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

        {/* Ghost text placeholder — wired up fully in Phase 5 */}
        {activeVersionContent && (
          <div className={styles.ghostWrap}>
            <div className={styles.ghostPlaceholder}>
              Ghost text active — semantic highlighting in Phase 5
            </div>
          </div>
        )}
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
          {wordCount} words
        </div>
        <div className={styles.statusItem} style={{ marginLeft: 'auto' }}>
          {saved ? 'Saved' : 'Saving...'}
        </div>
      </div>
    </div>
  )
}
```

---

## Step 3 — Create WritingEditor.module.css

Create `src/components/WritingEditor.module.css`:

```css
.container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
  flex-shrink: 0;
}

.toolBtn {
  background: none;
  border: none;
  color: var(--text2);
  font-size: 13px;
  padding: 4px 7px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
}

.toolBtn:hover {
  background: var(--bg3);
  color: var(--text);
}

.toolBtnActive {
  background: var(--accent-bg);
  color: var(--accent);
}

.sep {
  width: 1px;
  height: 14px;
  background: var(--border2);
  margin: 0 4px;
}

.exportGroup {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.exportLabel {
  font-size: 11px;
  color: var(--text3);
  margin-right: 4px;
}

.exportBtn {
  background: var(--bg4);
  border: 1px solid var(--border2);
  border-radius: 5px;
  color: var(--accent);
  font-size: 11px;
  padding: 4px 8px;
  cursor: pointer;
  font-family: inherit;
}

.exportBtn:hover {
  background: var(--accent-bg);
}

.editorWrap {
  flex: 1;
  overflow-y: auto;
  padding: 36px 48px 24px;
}

/* TipTap editor styles */
.editor {
  outline: none;
}

.editorContent {
  outline: none;
  font-family: 'Lora', 'Georgia', serif;
  font-size: 16px;
  line-height: 1.85;
  color: var(--text);
  caret-color: var(--accent);
  min-height: 200px;
}

.editorContent h1 {
  font-size: 24px;
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 16px;
  color: var(--text);
  font-family: 'Lora', 'Georgia', serif;
}

.editorContent h2 {
  font-size: 19px;
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 12px;
  color: var(--text);
  font-family: 'Lora', 'Georgia', serif;
}

.editorContent p {
  margin-bottom: 0;
}

.editorContent p + p {
  margin-top: 8px;
}

.editorContent ul, .editorContent ol {
  padding-left: 24px;
  margin: 8px 0;
}

.editorContent li {
  margin: 4px 0;
}

.editorContent p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--text3);
  pointer-events: none;
  height: 0;
}

/* Ghost text area */
.ghostWrap {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border2);
}

.ghostPlaceholder {
  font-family: 'Lora', 'Georgia', serif;
  font-size: 14px;
  color: var(--text3);
  font-style: italic;
}

/* Legend */
.legend {
  display: flex;
  gap: 16px;
  padding: 8px 48px;
  border-top: 1px solid var(--border);
  background: var(--bg);
  flex-shrink: 0;
}

.legendItem {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text2);
}

.legendBlock {
  width: 28px;
  height: 12px;
  border-radius: 3px;
}

/* Status bar */
.statusBar {
  height: 26px;
  background: var(--bg2);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 16px;
  flex-shrink: 0;
}

.statusItem {
  font-size: 10px;
  color: var(--text3);
  display: flex;
  align-items: center;
  gap: 5px;
}

.statusDot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--status-dot);
}
```

---

## Step 4 — Update ProjectView to pass activeVersionContent to WritingEditor

Update `src/components/ProjectView.jsx` — replace the Writing tab section:

```jsx
{activeTab === 'writing' && (
  <WritingEditor
    projectId={projectId}
    activeVersionContent={activeVersionContent}
  />
)}
```

And add the import at the top:

```jsx
import WritingEditor from './WritingEditor'
```

---

## Step 5 — Run and verify

```bash
npm run dev
```

Test:
1. Create a project and go to Writing tab
2. Type some text — it should use Lora serif font
3. Select text, click B — it becomes bold
4. Click H1 — the paragraph becomes a heading
5. Click •— — creates a bullet list
6. After 2 seconds of no typing, "Saving..." appears then "Saved"
7. Close and reopen the app — your text is still there
8. Go to AI Versions, save a version, go back to Writing — the ghost placeholder text appears

If the editor works and content persists across restarts, Phase 4 is done.
