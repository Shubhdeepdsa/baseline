import { app, BrowserWindow, ipcMain } from 'electron'
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

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function getTimestamp() {
  const now = new Date()
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

// ─── IPC HANDLERS ──────────────────────────────────────────────────────────

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
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const projectDir = getProjectDir(id)

  if (fs.existsSync(projectDir)) {
    return { error: 'A project with this name already exists.' }
  }

  ensureDir(projectDir)
  ensureDir(path.join(projectDir, 'ai-versions'))
  ensureDir(path.join(projectDir, 'exports'))

  fs.writeFileSync(path.join(projectDir, 'brain-dump.md'), '', 'utf8')
  fs.writeFileSync(path.join(projectDir, 'writing.md'), '', 'utf8')

  return { id, name }
})

// Read brain-dump.md or writing.md — type is 'braindump' or 'writing'
ipcMain.handle('readFile', (_, projectId, type) => {
  const filename = type === 'braindump' ? 'brain-dump.md' : type === 'writing' ? 'writing.md' : 'active-version.txt'
  const filePath = path.join(getProjectDir(projectId), filename)
  try {
    return { content: fs.readFileSync(filePath, 'utf8') }
  } catch {
    return { content: '' }
  }
})

// Save brain-dump.md or writing.md
ipcMain.handle('saveFile', (_, projectId, type, content) => {
  const filename = type === 'braindump' ? 'brain-dump.md' : type === 'writing' ? 'writing.md' : 'active-version.txt'
  const filePath = path.join(getProjectDir(projectId), filename)
  try {
    fs.writeFileSync(filePath, content, 'utf8')
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
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

// Get settings
ipcMain.handle('getSettings', () => {
  return {
    baseDir: store.get('baseDir', path.join(app.getPath('home'), 'Baseline', 'projects')),
    theme: store.get('theme', 'dark'),
  }
})

// Save settings
ipcMain.handle('saveSettings', (_, settings) => {
  if (settings.baseDir) store.set('baseDir', settings.baseDir)
  if (settings.theme) store.set('theme', settings.theme)
  return { success: true }
})

// Export file — saves to exports/ folder in the project
ipcMain.handle('exportFile', (_, projectId, format, content) => {
  const exportsDir = path.join(getProjectDir(projectId), 'exports')
  ensureDir(exportsDir)

  const timestamp = getTimestamp()
  const filename = `${projectId}_${timestamp}.${format}`
  const filePath = path.join(exportsDir, filename)

  fs.writeFileSync(filePath, content, format === 'md' ? 'utf8' : undefined)
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

app.whenReady().then(createWindow)
