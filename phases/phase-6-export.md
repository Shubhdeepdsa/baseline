# Baseline — Phase 6: Export + Polish

## What this phase produces
Export to MD, PDF, and Word (.docx) fully works. Light/dark preference persists across restarts. App has an icon. First-time user sees an onboarding empty state. The app is ready to share with other people.

## End state checklist
- [ ] Export to .md works and opens the file in Finder/Explorer
- [ ] Export to .pdf produces a clean readable PDF
- [ ] Export to .docx produces a Word file that opens in Word/Pages
- [ ] Light/dark preference remembered between app restarts
- [ ] App icon set (dock + taskbar)
- [ ] Empty state shown when no projects exist
- [ ] Window title shows current project name

---

## Step 1 — Install export libraries

```bash
npm install jspdf html2canvas docx
```

---

## Step 2 — Create the exporters utility

Create `src/utils/exporters.js`:

```js
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
        children: parseInlineMarkdown(line.slice(2)),
      }))
    } else if (/^\d+\. /.test(line)) {
      const text = line.replace(/^\d+\. /, '')
      children.push(new Paragraph({
        numbering: { reference: 'numbers', level: 0 },
        children: parseInlineMarkdown(text),
      }))
    } else {
      children.push(new Paragraph({
        children: parseInlineMarkdown(line),
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

  return await Packer.toBuffer(doc)
}

// Parse inline markdown (bold, italic) into TextRun array
function parseInlineMarkdown(text) {
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
```

---

## Step 3 — Update the IPC export handler in main.js

Replace the `exportFile` handler in `electron/main.js`:

```js
ipcMain.handle('exportFile', (_, projectId, format, content) => {
  const exportsDir = path.join(getProjectDir(projectId), 'exports')
  ensureDir(exportsDir)

  const timestamp = getTimestamp()
  const filename = `${projectId}_${timestamp}.${format}`
  const filePath = path.join(exportsDir, filename)

  if (format === 'md') {
    fs.writeFileSync(filePath, content, 'utf8')
  } else {
    // For PDF and DOCX, content is a base64-encoded ArrayBuffer
    const buffer = Buffer.from(content, 'base64')
    fs.writeFileSync(filePath, buffer)
  }

  // Open the exports folder in Finder/Explorer
  const { shell } = await import('electron')
  shell.showItemInFolder(filePath)

  return { success: true, path: filePath }
})
```

Also add at the top of main.js:
```js
import { app, BrowserWindow, ipcMain, shell } from 'electron'
```

---

## Step 4 — Update WritingEditor export handlers

Update the `handleExport` function in `WritingEditor.jsx`:

```jsx
async function handleExport(format) {
  if (!editor) return

  const markdown = editorToMarkdown(editor)

  if (format === 'md') {
    await window.electron.exportFile(projectId, 'md', markdown)
    return
  }

  if (format === 'pdf') {
    const { exportToPDF } = await import('../utils/exporters')
    const arrayBuffer = await exportToPDF(editor.getHTML(), projectId)
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    await window.electron.exportFile(projectId, 'pdf', base64)
    return
  }

  if (format === 'docx') {
    const { exportToDocx } = await import('../utils/exporters')
    const arrayBuffer = await exportToDocx(markdown, projectId)
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    await window.electron.exportFile(projectId, 'docx', base64)
    return
  }
}
```

---

## Step 5 — Persist theme across restarts

The `useSettings` hook already saves theme to `electron-store`. But we need to load it before the first render to avoid a flash. Update `src/App.jsx` to initialise theme synchronously:

```jsx
// At the very top of App(), before any state
// We read the saved theme synchronously from a data attribute set by preload
const savedTheme = document.documentElement.getAttribute('data-theme') || 'dark'
const [theme, setTheme] = useState(savedTheme)
```

Update `electron/preload.js` to set the theme attribute before React loads:

```js
import { contextBridge, ipcRenderer } from 'electron'

// Set theme immediately to avoid flash — runs before React
ipcRenderer.invoke('getSettings').then(settings => {
  document.documentElement.setAttribute('data-theme', settings.theme || 'dark')
})

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  getProjects: () => ipcRenderer.invoke('getProjects'),
  createProject: (name) => ipcRenderer.invoke('createProject', name),
  readFile: (projectId, type) => ipcRenderer.invoke('readFile', projectId, type),
  saveFile: (projectId, type, content) => ipcRenderer.invoke('saveFile', projectId, type, content),
  getVersions: (projectId) => ipcRenderer.invoke('getVersions', projectId),
  saveVersion: (projectId, content) => ipcRenderer.invoke('saveVersion', projectId, content),
  readVersion: (projectId, filename) => ipcRenderer.invoke('readVersion', projectId, filename),
  deleteVersion: (projectId, filename) => ipcRenderer.invoke('deleteVersion', projectId, filename),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('saveSettings', settings),
  exportFile: (projectId, format, content) => ipcRenderer.invoke('exportFile', projectId, format, content),
})
```

---

## Step 6 — Set the window title to the current project name

In `App.jsx`, add this effect:

```jsx
useEffect(() => {
  if (activeProject) {
    const project = projects.find(p => p.id === activeProject)
    if (project) {
      document.title = `${project.name} — Baseline`
    }
  } else {
    document.title = 'Baseline'
  }
}, [activeProject, projects])
```

---

## Step 7 — Add app icon

1. Create a 1024x1024 PNG icon. Name it `icon.png`. Place it at `build/icon.png`.
2. For Mac, also create `build/icon.icns` (use an online converter).
3. For Windows, create `build/icon.ico`.

Update `package.json` to add the electron-builder config:

```json
{
  "build": {
    "appId": "com.baseline.app",
    "productName": "Baseline",
    "mac": {
      "icon": "build/icon.icns",
      "category": "public.app-category.productivity"
    },
    "win": {
      "icon": "build/icon.ico"
    },
    "directories": {
      "output": "release"
    }
  }
}
```

Install electron-builder:

```bash
npm install --save-dev electron-builder
```

Add to `package.json` scripts:
```json
"scripts": {
  "build:mac": "electron-builder --mac",
  "build:win": "electron-builder --win"
}
```

---

## Step 8 — Run and verify all exports

```bash
npm run dev
```

Test:
1. Write a few paragraphs with headings and bullets
2. Click Export → .md — Finder opens showing the file, open it in VS Code and verify content
3. Click Export → .pdf — Finder opens, open the PDF and verify formatting
4. Click Export → .docx — Finder opens, open in Word/Pages and verify

Then test persistence:
1. Switch to Light mode
2. Quit the app completely (Cmd+Q)
3. Reopen — should open in Light mode

---

## Step 9 — Build for distribution (when ready)

```bash
# For Mac
npm run build:mac

# For Windows (run on Windows or use CI)
npm run build:win
```

Output will be in `release/` folder. This gives you:
- Mac: `Baseline.dmg` — drag to Applications
- Windows: `Baseline Setup.exe` — standard installer

---

## You're done

The full Baseline v1 is complete:

- Brain dump → AI Versions → Writing workflow ✅
- Ghost text with real semantic embeddings ✅
- Green/orange/yellow dynamic highlighting ✅
- Auto-clear covered sentences ✅
- Export to MD, PDF, Word ✅
- Light and dark mode ✅
- Fully local, no cloud, no API keys ✅
- Real files on disk, open in any editor ✅

Next steps when ready to open source:
1. Write `README.md` explaining what Baseline is, why you built it, how to run it
2. Add `LICENSE` (MIT)
3. Push to GitHub
4. Post about it
