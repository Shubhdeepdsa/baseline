// ─── MARKDOWN EXPORT ────────────────────────────────────────
// MD is trivial — the writing.md file IS the export.
// The IPC handler in main.js already handles this.
// Just call window.electron.exportFile(projectId, 'md', markdownContent)

// ─── PDF EXPORT ─────────────────────────────────────────────
export async function exportToPDF(htmlContent, projectName) {
  const { default: jsPDF } = await import('jspdf')
  const { default: html2canvas } = await import('html2canvas')

  // Create a hidden div with the content styled for print
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed;
    top: -9999px;
    left: -9999px;
    width: 794px;
    padding: 72px 80px;
    background: #FFFFFF;
    font-family: Georgia, serif;
    font-size: 12pt;
    line-height: 1.8;
    color: #1A1814;
  `
  container.innerHTML = htmlContent
  document.body.appendChild(container)

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF',
    })

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const imgData = canvas.toDataURL('image/png')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width

    // Handle multi-page
    const pageHeight = pdf.internal.pageSize.getHeight()
    let heightLeft = pdfHeight
    let position = 0

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight)
    heightLeft -= pageHeight

    while (heightLeft >= 0) {
      position = heightLeft - pdfHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight)
      heightLeft -= pageHeight
    }

    return pdf.output('arraybuffer')
  } finally {
    document.body.removeChild(container)
  }
}

// ─── WORD EXPORT ─────────────────────────────────────────────
export async function exportToDocx(markdownContent, projectName) {
  const {
    Document, Packer, Paragraph, TextRun,
    HeadingLevel, AlignmentType, LevelFormat
  } = await import('docx')

  const lines = markdownContent.split('\n')
  const children = []

  for (const line of lines) {
    if (!line.trim()) {
      children.push(new Paragraph({ children: [new TextRun('')] }))
      continue
    }

    if (line.startsWith('# ')) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: line.slice(2), bold: true })],
      }))
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: line.slice(3), bold: true })],
      }))
    } else if (line.startsWith('- ')) {
      children.push(new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        children: parseInlineMarkdown(line.slice(2), TextRun),
      }))
    } else if (/^\d+\. /.test(line)) {
      const text = line.replace(/^\d+\. /, '')
      children.push(new Paragraph({
        numbering: { reference: 'numbers', level: 0 },
        children: parseInlineMarkdown(text, TextRun),
      }))
    } else {
      children.push(new Paragraph({
        children: parseInlineMarkdown(line, TextRun),
      }))
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: 'numbers',
          levels: [{
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    }],
  })

  const blob = await Packer.toBlob(doc)
  return await blob.arrayBuffer()
}

// Parse inline markdown (bold, italic) into TextRun array
function parseInlineMarkdown(text, TextRun) {
  const runs = []
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|(.+?)(?=\*\*|\*|$)/g
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match[0] === '') break
    if (match[1]) {
      runs.push(new TextRun({ text: match[1], bold: true }))
    } else if (match[2]) {
      runs.push(new TextRun({ text: match[2], italics: true }))
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3] }))
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text })]
}
