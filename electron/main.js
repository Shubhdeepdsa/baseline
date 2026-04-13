import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import Store from 'electron-store'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

const store = new Store()
let win

// ─── HELPERS ───────────────────────────────────────────────────────────────

function getBaseDir() {
  return store.get('baseDir', path.join(app.getPath('home'), 'Baseline', 'projects'))
}

function getProjectDir(projectId) {
  return path.join(getBaseDir(), projectId)
}

function getGhostStatePath(projectId) {
  return path.join(getProjectDir(projectId), 'ghost-state.json')
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function getTimestamp() {
  const now = new Date()
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function slugifyName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function filenameToName(filename) {
  return filename.replace(/\.md$/, '').replace(/-/g, ' ')
}

function rewriteWikiLinks(content, fromFilename, toName) {
  const fromSlug = fromFilename.replace(/\.md$/, '')

  return content.replace(/\[\[([^[\]]+?)\]\]/g, (match, label) => {
    return slugifyName(label) === fromSlug ? `[[${toName}]]` : match
  })
}

// ─── IPC HANDLERS ──────────────────────────────────────────────────────────

ipcMain.handle('consoleError', (_, errStr) => {
  console.error('\n====== ERROR FROM RENDERER ======')
  console.error(errStr)
  console.error('=================================\n')
})

// Get all projects — returns array of { id, name, modifiedAt }
ipcMain.handle('getProjects', () => {
  const baseDir = getBaseDir()
  ensureDir(baseDir)

  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
  const projects = entries
    .filter(e => e.isDirectory())
    .map(e => {
      const projectDir = path.join(baseDir, e.name)
      const writingPath = path.join(projectDir, 'writing.md')
      let modifiedAt = null
      try {
        const stat = fs.statSync(writingPath)
        modifiedAt = stat.mtime.toISOString()
      } catch {}
      return {
        id: e.name,
        name: e.name.replace(/-/g, ' '),
        modifiedAt,
      }
    })
    .sort((a, b) => {
      if (!a.modifiedAt) return 1
      if (!b.modifiedAt) return -1
      return new Date(b.modifiedAt) - new Date(a.modifiedAt)
    })

  return projects
})

// Create a new project — creates folder + brain-dump.md + writing.md + ai-versions/
ipcMain.handle('createProject', (_, name) => {
  const id = slugifyName(name)
  const projectDir = getProjectDir(id)

  if (fs.existsSync(projectDir)) {
    return { error: 'A project with this name already exists.' }
  }

  ensureDir(projectDir)
  ensureDir(path.join(projectDir, 'ai-versions'))
  ensureDir(path.join(projectDir, 'brain-dumps'))
  ensureDir(path.join(projectDir, 'exports'))

  fs.writeFileSync(path.join(projectDir, 'brain-dumps', 'main.md'), '', 'utf8')
  fs.writeFileSync(path.join(projectDir, 'writing.md'), '', 'utf8')

  return { id, name }
})

// Delete a project folder
ipcMain.handle('deleteProject', (_, projectId) => {
  const projectDir = getProjectDir(projectId)
  try {
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
    
    // Clear lastProjectId if it was the deleted one
    if (store.get('lastProjectId') === projectId) {
      store.delete('lastProjectId')
    }
    
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// Read brain-dump.md or writing.md — type is 'braindump' or 'writing' or 'active-braindump'
ipcMain.handle('readFile', (_, projectId, type, filename = 'main.md') => {
  const projectDir = getProjectDir(projectId)
  let filePath
  
  if (type === 'braindump') {
    const dumpsDir = path.join(projectDir, 'brain-dumps')
    ensureDir(dumpsDir)
    
    // Migration: if brain-dump.md exists in root, move it to brain-dumps/main.md
    const legacyPath = path.join(projectDir, 'brain-dump.md')
    const newMainPath = path.join(dumpsDir, 'main.md')
    if (fs.existsSync(legacyPath) && !fs.existsSync(newMainPath)) {
      try {
        fs.renameSync(legacyPath, newMainPath)
      } catch (err) {
        console.error('Migration failed:', err)
      }
    } else if (fs.existsSync(legacyPath) && fs.existsSync(newMainPath)) {
      // If both exist, keep legacy as backup just in case? Or just delete?
      // Let's just rename it to main_legacy.md if it doesn't exist
      const legacyBackup = path.join(dumpsDir, 'main_legacy.md')
      if (!fs.existsSync(legacyBackup)) {
        fs.renameSync(legacyPath, legacyBackup)
      }
    }
    
    filePath = path.join(dumpsDir, filename)
  } else if (type === 'writing') {
    filePath = path.join(projectDir, 'writing.md')
  } else if (type === 'active-braindump') {
    filePath = path.join(projectDir, 'active-braindump.txt')
  } else {
    filePath = path.join(projectDir, 'active-version.txt')
  }

  try {
    return { content: fs.readFileSync(filePath, 'utf8') }
  } catch {
    return { content: '' }
  }
})

// Save brain-dump.md or writing.md
ipcMain.handle('saveFile', (_, projectId, type, content, filename = 'main.md') => {
  const projectDir = getProjectDir(projectId)
  let filePath
  
  if (type === 'braindump') {
    const dumpsDir = path.join(projectDir, 'brain-dumps')
    ensureDir(dumpsDir)
    filePath = path.join(dumpsDir, filename)
  } else if (type === 'writing') {
    filePath = path.join(projectDir, 'writing.md')
  } else if (type === 'active-braindump') {
    filePath = path.join(projectDir, 'active-braindump.txt')
  } else {
    filePath = path.join(projectDir, 'active-version.txt')
  }

  try {
    fs.writeFileSync(filePath, content, 'utf8')
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('readGhostState', (_, projectId) => {
  const filePath = getGhostStatePath(projectId)

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return { versions: {} }
  }
})

ipcMain.handle('saveGhostState', (_, projectId, state) => {
  const projectDir = getProjectDir(projectId)
  ensureDir(projectDir)

  try {
    fs.writeFileSync(getGhostStatePath(projectId), JSON.stringify(state, null, 2), 'utf8')
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('writeClipboardText', (_, text) => {
  clipboard.writeText(text || '')
  return { success: true }
})

// Get all AI versions for a project — returns array of { filename, versionNumber, createdAt }
ipcMain.handle('getVersions', (_, projectId) => {
  const versionsDir = path.join(getProjectDir(projectId), 'ai-versions')
  ensureDir(versionsDir)

  const files = fs.readdirSync(versionsDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()

  return files.map((filename, index) => {
    const versionNumber = files.length - index
    const stat = fs.statSync(path.join(versionsDir, filename))
    return {
      filename,
      versionNumber,
      createdAt: stat.birthtime.toISOString(),
    }
  })
})

// Save a new AI version — auto-names with timestamp
ipcMain.handle('saveVersion', (_, projectId, content) => {
  const versionsDir = path.join(getProjectDir(projectId), 'ai-versions')
  ensureDir(versionsDir)

  const existing = fs.readdirSync(versionsDir).filter(f => f.endsWith('.md'))
  const versionNumber = existing.length + 1
  const filename = `v${versionNumber}_${getTimestamp()}.md`
  const filePath = path.join(versionsDir, filename)

  fs.writeFileSync(filePath, content, 'utf8')
  return { filename, versionNumber }
})

// Read a specific AI version file
ipcMain.handle('readVersion', (_, projectId, filename) => {
  const filePath = path.join(getProjectDir(projectId), 'ai-versions', filename)
  try {
    return { content: fs.readFileSync(filePath, 'utf8') }
  } catch {
    return { content: '' }
  }
})

// Delete a specific AI version file
ipcMain.handle('deleteVersion', (_, projectId, filename) => {
  const filePath = path.join(getProjectDir(projectId), 'ai-versions', filename)
  try {
    fs.unlinkSync(filePath)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// --- BRAIN DUMPS ---

ipcMain.handle('getBrainDumps', (_, projectId) => {
  const dumpsDir = path.join(getProjectDir(projectId), 'brain-dumps')
  ensureDir(dumpsDir)
  
  // Also check for migration in getBrainDumps just in case
  const projectDir = getProjectDir(projectId)
  const legacyPath = path.join(projectDir, 'brain-dump.md')
  if (fs.existsSync(legacyPath)) {
    const newMainPath = path.join(dumpsDir, 'main.md')
    if (!fs.existsSync(newMainPath)) {
      fs.renameSync(legacyPath, newMainPath)
    } else {
      const legacyBackup = path.join(dumpsDir, 'main_legacy.md')
      if (!fs.existsSync(legacyBackup)) {
        fs.renameSync(legacyPath, legacyBackup)
      }
    }
  }

  const files = fs.readdirSync(dumpsDir)
    .filter(f => f.endsWith('.md'))
    .sort((a, b) => {
      if (a === 'main.md') return -1
      if (b === 'main.md') return 1
      return a.localeCompare(b)
    })

  return files.map(filename => ({
    filename,
    name: filenameToName(filename),
  }))
})

ipcMain.handle('createBrainDump', (_, projectId, name) => {
  const id = slugifyName(name)
  const filename = `${id}.md`
  const dumpsDir = path.join(getProjectDir(projectId), 'brain-dumps')
  ensureDir(dumpsDir)
  
  const filePath = path.join(dumpsDir, filename)
  if (fs.existsSync(filePath)) {
    return { error: 'A brain dump with this name already exists.' }
  }

  fs.writeFileSync(filePath, '', 'utf8')
  return { filename, name }
})

ipcMain.handle('renameBrainDump', (_, projectId, oldFilename, requestedName) => {
  if (oldFilename === 'main.md') {
    return { error: 'Cannot rename the default brain dump.' }
  }

  const newSlug = slugifyName(requestedName)
  if (!newSlug) {
    return { error: 'Please enter a valid brain dump name.' }
  }

  const newFilename = `${newSlug}.md`
  const newName = filenameToName(newFilename)
  const projectDir = getProjectDir(projectId)
  const dumpsDir = path.join(projectDir, 'brain-dumps')
  ensureDir(dumpsDir)

  const oldPath = path.join(dumpsDir, oldFilename)
  const newPath = path.join(dumpsDir, newFilename)

  if (!fs.existsSync(oldPath)) {
    return { error: 'That brain dump no longer exists.' }
  }

  if (newFilename !== oldFilename && fs.existsSync(newPath)) {
    return { error: 'A brain dump with this name already exists.' }
  }

  try {
    if (newFilename !== oldFilename) {
      fs.renameSync(oldPath, newPath)
    }

    const files = fs.readdirSync(dumpsDir).filter(file => file.endsWith('.md'))
    files.forEach(filename => {
      const filePath = path.join(dumpsDir, filename)
      const content = fs.readFileSync(filePath, 'utf8')
      const updated = rewriteWikiLinks(content, oldFilename, newName)

      if (updated !== content) {
        fs.writeFileSync(filePath, updated, 'utf8')
      }
    })

    const activeFilePath = path.join(projectDir, 'active-braindump.txt')
    if (fs.existsSync(activeFilePath)) {
      const activeFilename = fs.readFileSync(activeFilePath, 'utf8').trim()
      if (activeFilename === oldFilename) {
        fs.writeFileSync(activeFilePath, newFilename, 'utf8')
      }
    }

    return { success: true, filename: newFilename, name: newName }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('deleteBrainDump', (_, projectId, filename) => {
  if (filename === 'main.md') {
    return { error: 'Cannot delete the default brain dump.' }
  }
  const filePath = path.join(getProjectDir(projectId), 'brain-dumps', filename)
  try {
    fs.unlinkSync(filePath)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// Get settings
ipcMain.handle('getSettings', () => {
  return {
    baseDir: store.get('baseDir', path.join(app.getPath('home'), 'Baseline', 'projects')),
    theme: store.get('theme', 'dark'),
    ghostBehavior: store.get('ghostBehavior', 'hide'),
    ghostSelectionMode: store.get('ghostSelectionMode', 'sentence'),
    ghostSplitOrientation: store.get('ghostSplitOrientation', 'horizontal'),
    ghostSplitRatioHorizontal: store.get('ghostSplitRatioHorizontal', 0.62),
    ghostSplitRatioVertical: store.get('ghostSplitRatioVertical', 0.58),
    ghostRemovedVisibility: store.get('ghostRemovedVisibility', 'show'),
    lastProjectId: store.get('lastProjectId', null),
    lastTabId: store.get('lastTabId', 'writing'),
  }
})

// Save settings
ipcMain.handle('saveSettings', (_, settings) => {
  if (settings.baseDir) store.set('baseDir', settings.baseDir)
  if (settings.theme) store.set('theme', settings.theme)
  if (settings.ghostBehavior) store.set('ghostBehavior', settings.ghostBehavior)
  if (settings.ghostSelectionMode) store.set('ghostSelectionMode', settings.ghostSelectionMode)
  if (settings.ghostSplitOrientation) store.set('ghostSplitOrientation', settings.ghostSplitOrientation)
  if (settings.ghostSplitRatioHorizontal !== undefined) store.set('ghostSplitRatioHorizontal', settings.ghostSplitRatioHorizontal)
  if (settings.ghostSplitRatioVertical !== undefined) store.set('ghostSplitRatioVertical', settings.ghostSplitRatioVertical)
  if (settings.ghostRemovedVisibility) store.set('ghostRemovedVisibility', settings.ghostRemovedVisibility)
  if (settings.lastProjectId !== undefined) store.set('lastProjectId', settings.lastProjectId)
  if (settings.lastTabId) store.set('lastTabId', settings.lastTabId)
  return { success: true }
})

// Export file — asks user where to save, then writes and shows
ipcMain.handle('exportFile', async (_, projectId, format, content) => {
  const timestamp = getTimestamp()
  const defaultFilename = `${projectId}_${timestamp}.${format}`

  const filters = []
  if (format === 'md') filters.push({ name: 'Markdown', extensions: ['md'] })
  else if (format === 'pdf') filters.push({ name: 'PDF', extensions: ['pdf'] })
  else if (format === 'docx') filters.push({ name: 'Word Document', extensions: ['docx'] })

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: `Export as ${format.toUpperCase()}`,
    defaultPath: defaultFilename,
    filters
  })

  if (canceled || !filePath) {
    return { success: false, canceled: true }
  }

  if (format === 'md') {
    fs.writeFileSync(filePath, content, 'utf8')
  } else {
    // For PDF and DOCX, content is a base64-encoded string
    const buffer = Buffer.from(content, 'base64')
    fs.writeFileSync(filePath, buffer)
  }

  shell.showItemInFolder(filePath)
  return { success: true, path: filePath }
})

// ─── WINDOW ─────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0E0C0A',
    icon: path.join(process.env.APP_ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(process.env.APP_ROOT, 'build', 'icon.png'))
  }
  createWindow()
})
