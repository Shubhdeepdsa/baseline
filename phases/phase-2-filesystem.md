# Baseline — Phase 2: File System Layer

## What this phase produces
Every project creates real folders and files on disk. The IPC bridge between Electron and React is fully wired. You can create a project, and see `~/Baseline/projects/my-project/` appear in Finder with `brain-dump.md`, `writing.md`, and an `ai-versions/` folder inside it.

## End state checklist
- [ ] `~/Baseline/projects/` folder is created automatically on first launch
- [ ] Creating a project creates a real folder + 3 files on disk
- [ ] Projects load from disk on startup (not hardcoded mock data)
- [ ] `window.electron.*` IPC functions all work from React
- [ ] No errors in console

---

## Step 1 — Install required Node packages

```bash
npm install electron-store
```

`electron-store` handles saving user settings (like the base folder path) persistently between app restarts.

---

## Step 2 — Rewrite electron/preload.js

This file creates the bridge between React and Node. Replace the entire file:

```js
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,

  // Projects
  getProjects: () => ipcRenderer.invoke('getProjects'),
  createProject: (name) => ipcRenderer.invoke('createProject', name),

  // Files
  readFile: (projectId, type) => ipcRenderer.invoke('readFile', projectId, type),
  saveFile: (projectId, type, content) => ipcRenderer.invoke('saveFile', projectId, type, content),

  // AI Versions
  getVersions: (projectId) => ipcRenderer.invoke('getVersions', projectId),
  saveVersion: (projectId, content) => ipcRenderer.invoke('saveVersion', projectId, content),
  readVersion: (projectId, filename) => ipcRenderer.invoke('readVersion', projectId, filename),
  deleteVersion: (projectId, filename) => ipcRenderer.invoke('deleteVersion', projectId, filename),

  // Settings
  getSettings: () => ipcRenderer.invoke('getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('saveSettings', settings),

  // Export
  exportFile: (projectId, format, content) => ipcRenderer.invoke('exportFile', projectId, format, content),
})
```

---

## Step 3 — Rewrite electron/main.js

Replace the entire file. This is the complete backend — all 10 IPC functions:

```js
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
  const filename = type === 'braindump' ? 'brain-dump.md' : 'writing.md'
  const filePath = path.join(getProjectDir(projectId), filename)
  try {
    return { content: fs.readFileSync(filePath, 'utf8') }
  } catch {
    return { content: '' }
  }
})

// Save brain-dump.md or writing.md
ipcMain.handle('saveFile', (_, projectId, type, content) => {
  const filename = type === 'braindump' ? 'brain-dump.md' : 'writing.md'
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
```

---

## Step 4 — Create the useProjects hook

Create `src/hooks/useProjects.js`:

```js
import { useState, useEffect } from 'react'

export function useProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadProjects() {
    const result = await window.electron.getProjects()
    setProjects(result)
    setLoading(false)
  }

  async function createProject(name) {
    if (!name || !name.trim()) return { error: 'Name is required' }
    const result = await window.electron.createProject(name.trim())
    if (!result.error) {
      await loadProjects()
    }
    return result
  }

  useEffect(() => {
    loadProjects()
  }, [])

  return { projects, loading, createProject, reload: loadProjects }
}
```

---

## Step 5 — Create the useSettings hook

Create `src/hooks/useSettings.js`:

```js
import { useState, useEffect } from 'react'

export function useSettings() {
  const [settings, setSettings] = useState({ theme: 'dark' })

  useEffect(() => {
    window.electron.getSettings().then(s => setSettings(s))
  }, [])

  async function saveSetting(key, value) {
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    await window.electron.saveSettings({ [key]: value })
  }

  return { settings, saveSetting }
}
```

---

## Step 6 — Update Sidebar to use real data

Replace `src/components/Sidebar.jsx` with:

```jsx
import { useState } from 'react'
import styles from './Sidebar.module.css'

function formatDate(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1d ago'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 14) return '1w ago'
  return `${Math.floor(diffDays / 7)}w ago`
}

export default function Sidebar({ projects, activeProject, onSelectProject, onNewProject }) {
  return (
    <div className={styles.sidebar}>
      <div className={styles.top}>
        <div className={styles.logo}>baseline.</div>
        <button className={styles.newBtn} onClick={onNewProject}>
          <span className={styles.plus}>+</span>
          New project
        </button>
      </div>

      <div className={styles.sectionLabel}>Projects</div>

      <div className={styles.projectList}>
        {projects.length === 0 && (
          <div className={styles.empty}>No projects yet.</div>
        )}
        {projects.map(project => (
          <div
            key={project.id}
            className={`${styles.project} ${activeProject === project.id ? styles.active : ''}`}
            onClick={() => onSelectProject(project.id)}
          >
            <span className={styles.projectDot} />
            <span className={styles.projectName}>{project.name}</span>
            <span className={styles.projectDate}>{formatDate(project.modifiedAt)}</span>
          </div>
        ))}
      </div>

      <div className={styles.footer}>v0.1.0 — open source</div>
    </div>
  )
}
```

Add to `src/components/Sidebar.module.css`:

```css
.empty {
  font-size: 12px;
  color: var(--text3);
  padding: 16px 14px;
}
```

---

## Step 7 — Create the NewProjectModal component

Create `src/components/NewProjectModal.jsx`:

```jsx
import { useState } from 'react'
import styles from './NewProjectModal.module.css'

export default function NewProjectModal({ onConfirm, onCancel }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!name.trim()) { setError('Please enter a project name'); return }
    const result = await onConfirm(name.trim())
    if (result?.error) setError(result.error)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>New project</h2>
        <p className={styles.subtitle}>Give your writing project a name.</p>
        <input
          className={styles.input}
          type="text"
          placeholder="e.g. Masters SOP"
          value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.createBtn} onClick={handleCreate}>Create</button>
        </div>
      </div>
    </div>
  )
}
```

Create `src/components/NewProjectModal.module.css`:

```css
.overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--bg4);
  border: 1px solid var(--border2);
  border-radius: 12px;
  padding: 28px;
  width: 360px;
}

.title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 6px;
}

.subtitle {
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 20px;
}

.input {
  width: 100%;
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: 7px;
  padding: 9px 12px;
  font-size: 13px;
  color: var(--text);
  font-family: inherit;
  outline: none;
  margin-bottom: 8px;
}

.input:focus {
  border-color: var(--accent-border);
}

.input::placeholder {
  color: var(--text3);
}

.error {
  font-size: 11px;
  color: #E24B4A;
  margin-bottom: 8px;
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}

.cancelBtn {
  background: none;
  border: 1px solid var(--border2);
  border-radius: 6px;
  color: var(--text2);
  font-size: 12px;
  padding: 7px 14px;
  cursor: pointer;
  font-family: inherit;
}

.cancelBtn:hover {
  background: var(--bg3);
}

.createBtn {
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: var(--bg);
  font-size: 12px;
  font-weight: 500;
  padding: 7px 14px;
  cursor: pointer;
  font-family: inherit;
}

.createBtn:hover {
  opacity: 0.9;
}
```

---

## Step 8 — Update App.jsx to wire everything

Replace `src/App.jsx`:

```jsx
import { useState } from 'react'
import './styles/theme.css'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import ProjectView from './components/ProjectView'
import NewProjectModal from './components/NewProjectModal'
import { useProjects } from './hooks/useProjects'
import { useSettings } from './hooks/useSettings'
import styles from './App.module.css'

export default function App() {
  const { settings, saveSetting } = useSettings()
  const { projects, createProject, reload } = useProjects()
  const [activeProject, setActiveProject] = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)

  const theme = settings.theme || 'dark'

  async function handleThemeToggle(newTheme) {
    await saveSetting('theme', newTheme)
  }

  async function handleCreateProject(name) {
    const result = await createProject(name)
    if (!result.error) {
      setActiveProject(result.id)
      setShowNewModal(false)
    }
    return result
  }

  // Auto-select first project if none selected
  if (!activeProject && projects.length > 0) {
    setActiveProject(projects[0].id)
  }

  return (
    <div className={`app-root ${theme}`} style={{ position: 'relative' }}>
      <Titlebar theme={theme} onToggleTheme={handleThemeToggle} />
      <div className={styles.body}>
        <Sidebar
          projects={projects}
          activeProject={activeProject}
          onSelectProject={setActiveProject}
          onNewProject={() => setShowNewModal(true)}
        />
        {activeProject
          ? <ProjectView key={activeProject} projectId={activeProject} />
          : <div className={styles.empty}>
              <p>Create a project to get started.</p>
              <button className={styles.emptyBtn} onClick={() => setShowNewModal(true)}>
                + New project
              </button>
            </div>
        }
      </div>
      {showNewModal && (
        <NewProjectModal
          onConfirm={handleCreateProject}
          onCancel={() => setShowNewModal(false)}
        />
      )}
    </div>
  )
}
```

Add to `src/App.module.css`:

```css
.body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text3);
  font-size: 13px;
}

.emptyBtn {
  background: var(--bg4);
  border: 1px solid var(--border2);
  border-radius: 7px;
  color: var(--accent);
  font-size: 12px;
  padding: 8px 16px;
  cursor: pointer;
  font-family: inherit;
}
```

---

## Step 9 — Run and verify

```bash
npm run dev
```

Then test:
1. Click "+ New project", type a name, press Enter
2. Open Finder → navigate to `~/Baseline/projects/`
3. You should see a folder named after your project
4. Inside it: `brain-dump.md`, `writing.md`, `ai-versions/`, `exports/`
5. The project appears in the sidebar
6. Create a second project — both show in sidebar, ordered by date

If the files appear on disk, Phase 2 is done.
