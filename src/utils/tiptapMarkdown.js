function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/&lt;u&gt;([\s\S]+?)&lt;\/u&gt;/g, '<u>$1</u>')
    .replace(/\+\+([\s\S]+?)\+\+/g, '<u>$1</u>')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
}

function listItemToMarkdown(node) {
  if (!node?.content) return ''

  return node.content
    .map(child => {
      if (child.type === 'paragraph') {
        return child.content?.map(inlineToMarkdown).join('') || ''
      }

      return jsonToMarkdown(child)
    })
    .filter(Boolean)
    .join('\n')
}

function inlineToMarkdown(node) {
  if (!node) return ''

  if (node.type === 'text') {
    let text = node.text || ''
    const marks = node.marks || []

    if (marks.find(mark => mark.type === 'bold')) text = `**${text}**`
    if (marks.find(mark => mark.type === 'italic')) text = `*${text}*`
    if (marks.find(mark => mark.type === 'underline')) text = `<u>${text}</u>`

    return text
  }

  if (node.type === 'hardBreak') {
    return '\n'
  }

  return ''
}

function jsonToMarkdown(node) {
  if (!node) return ''

  if (node.type === 'doc') {
    return node.content?.map(jsonToMarkdown).filter(Boolean).join('\n\n') || ''
  }

  if (node.type === 'paragraph') {
    return node.content?.map(inlineToMarkdown).join('') || ''
  }

  if (node.type === 'heading') {
    const level = Math.min(node.attrs?.level || 1, 2)
    return `${'#'.repeat(level)} ${node.content?.map(inlineToMarkdown).join('') || ''}`
  }

  if (node.type === 'bulletList') {
    return node.content?.map(item => `- ${listItemToMarkdown(item)}`).join('\n') || ''
  }

  if (node.type === 'orderedList') {
    const start = Number(node.attrs?.start) || 1
    return node.content?.map((item, index) => `${start + index}. ${listItemToMarkdown(item)}`).join('\n') || ''
  }

  if (node.type === 'listItem') {
    return listItemToMarkdown(node)
  }

  return node.content?.map(inlineToMarkdown).join('') || ''
}

export function editorToMarkdown(editor) {
  if (!editor) return ''

  return jsonToMarkdown(editor.getJSON())
}

export function markdownToHtml(markdown) {
  if (!markdown) return ''

  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let paragraphLines = []

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return

    blocks.push(`<p>${paragraphLines.map(renderInlineMarkdown).join('<br>')}</p>`)
    paragraphLines = []
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      continue
    }

    const headingMatch = line.match(/^(#{1,2})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      blocks.push(`<h${headingMatch[1].length}>${renderInlineMarkdown(headingMatch[2])}</h${headingMatch[1].length}>`)
      continue
    }

    if (/^\s*[-+*]\s+/.test(line)) {
      flushParagraph()
      const items = []

      while (i < lines.length && /^\s*[-+*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-+*]\s+/, ''))
        i += 1
      }

      i -= 1
      blocks.push(`<ul>${items.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`)
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph()
      const items = []

      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i += 1
      }

      i -= 1
      blocks.push(`<ol>${items.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ol>`)
      continue
    }

    paragraphLines.push(line)
  }

  flushParagraph()

  return blocks.join('')
}
