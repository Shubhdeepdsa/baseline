import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
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

function getVersionProvenancePath(projectId, filename) {
  return path.join(getProjectDir(projectId), 'ai-versions', `${filename}.provenance.json`)
}

function parseVersionFilename(filename) {
  const match = filename.match(/^v(\d+)(?:_(master|derived-from-v(\d+)))?(?:_.+)?\.md$/)
  if (!match) {
    return {
      versionNumber: null,
      kind: 'full',
      sourceVersionNumber: null,
    }
  }

  const versionNumber = Number(match[1])
  const tag = match[2] || null
  const sourceVersionNumber = match[3] ? Number(match[3]) : null

  if (tag === 'master') {
    return { versionNumber, kind: 'master', sourceVersionNumber: null }
  }

  if (tag?.startsWith('derived-from-v')) {
    return { versionNumber, kind: 'derived', sourceVersionNumber }
  }

  return { versionNumber, kind: 'full', sourceVersionNumber: null }
}

function getNextVersionNumber(versionsDir) {
  const existing = fs.readdirSync(versionsDir)
    .filter(f => f.endsWith('.md'))
    .map(filename => parseVersionFilename(filename).versionNumber)
    .filter(Number.isFinite)

  if (existing.length === 0) return 1
  return Math.max(...existing) + 1
}

function readVersionProvenance(projectId, filename) {
  const provenancePath = getVersionProvenancePath(projectId, filename)
  try {
    return JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
  } catch {
    return null
  }
}

function writeVersionProvenance(projectId, filename, provenance) {
  const provenancePath = getVersionProvenancePath(projectId, filename)

  if (!provenance || !Array.isArray(provenance.segments) || provenance.segments.length === 0) {
    if (fs.existsSync(provenancePath)) {
      fs.unlinkSync(provenancePath)
    }
    return
  }

  fs.writeFileSync(provenancePath, JSON.stringify(provenance, null, 2), 'utf8')
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

// Get all AI versions for a project — returns array of version metadata
ipcMain.handle('getVersions', (_, projectId) => {
  const versionsDir = path.join(getProjectDir(projectId), 'ai-versions')
  ensureDir(versionsDir)

  const files = fs.readdirSync(versionsDir)
    .filter(f => f.endsWith('.md'))
    .map(filename => {
      const stat = fs.statSync(path.join(versionsDir, filename))
      const parsed = parseVersionFilename(filename)
      return {
        filename,
        createdAt: stat.birthtime.toISOString(),
        versionNumber: parsed.versionNumber,
        kind: parsed.kind,
        sourceVersionNumber: parsed.sourceVersionNumber,
      }
    })
    .sort((a, b) => {
      const aVersion = Number.isFinite(a.versionNumber) ? a.versionNumber : -1
      const bVersion = Number.isFinite(b.versionNumber) ? b.versionNumber : -1
      if (aVersion !== bVersion) return bVersion - aVersion
      return new Date(b.createdAt) - new Date(a.createdAt)
    })

  return files.map((version) => {
    const provenance = readVersionProvenance(projectId, version.filename)
    const sourceCount = Array.isArray(provenance?.sources) ? provenance.sources.length : 0

    let label = version.versionNumber ? `Version ${version.versionNumber}` : version.filename.replace(/\.md$/, '')
    let subtitle = ''
    if (version.kind === 'master') {
      subtitle = sourceCount > 0 ? `${sourceCount} source${sourceCount === 1 ? '' : 's'}` : 'master ghost'
      label = version.versionNumber ? `Master v${version.versionNumber}` : 'Master ghost'
    } else if (version.kind === 'derived') {
      subtitle = version.sourceVersionNumber ? `derived from v${version.sourceVersionNumber}` : 'derived version'
    } else {
      subtitle = 'full version'
    }

    return {
      ...version,
      label,
      subtitle,
      sourceCount,
    }
  })
})

// Save a new AI version with metadata and optional provenance
ipcMain.handle('saveVersion', (_, projectId, payload) => {
  const versionsDir = path.join(getProjectDir(projectId), 'ai-versions')
  ensureDir(versionsDir)

  const normalized = typeof payload === 'string'
    ? { content: payload, kind: 'full', sourceFilename: null, provenance: null }
    : {
        content: payload?.content || '',
        kind: payload?.kind || 'full',
        sourceFilename: payload?.sourceFilename || null,
        provenance: payload?.provenance || null,
      }

  const versionNumber = getNextVersionNumber(versionsDir)
  const filename =
    normalized.kind === 'master'
      ? `v${versionNumber}_master_${getTimestamp()}.md`
      : normalized.kind === 'derived' && normalized.sourceFilename
        ? `v${versionNumber}_derived-from-v${parseVersionFilename(normalized.sourceFilename).versionNumber || 'x'}_${getTimestamp()}.md`
        : `v${versionNumber}_${getTimestamp()}.md`
  const filePath = path.join(versionsDir, filename)

  fs.writeFileSync(filePath, normalized.content, 'utf8')
  writeVersionProvenance(projectId, filename, normalized.provenance)

  const parsed = parseVersionFilename(filename)
  return {
    filename,
    versionNumber,
    kind: parsed.kind,
    sourceVersionNumber: parsed.sourceVersionNumber,
  }
})

// Read a specific AI version file
ipcMain.handle('readVersion', (_, projectId, filename) => {
  const filePath = path.join(getProjectDir(projectId), 'ai-versions', filename)
  const parsed = parseVersionFilename(filename)
  try {
    return {
      content: fs.readFileSync(filePath, 'utf8'),
      provenance: readVersionProvenance(projectId, filename),
      kind: parsed.kind,
      versionNumber: parsed.versionNumber,
      sourceVersionNumber: parsed.sourceVersionNumber,
    }
  } catch {
    return {
      content: '',
      provenance: null,
      kind: parsed.kind,
      versionNumber: parsed.versionNumber,
      sourceVersionNumber: parsed.sourceVersionNumber,
    }
  }
})

// Delete a specific AI version file
ipcMain.handle('deleteVersion', (_, projectId, filename) => {
  const filePath = path.join(getProjectDir(projectId), 'ai-versions', filename)
  const provenancePath = getVersionProvenancePath(projectId, filename)
  try {
    fs.unlinkSync(filePath)
    if (fs.existsSync(provenancePath)) {
      fs.unlinkSync(provenancePath)
    }
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
    lastProjectId: store.get('lastProjectId', null),
    lastTabId: store.get('lastTabId', 'writing'),
  }
})

// Save settings
ipcMain.handle('saveSettings', (_, settings) => {
  if (settings.baseDir) store.set('baseDir', settings.baseDir)
  if (settings.theme) store.set('theme', settings.theme)
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
