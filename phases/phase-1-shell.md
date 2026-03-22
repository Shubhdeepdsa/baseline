# Baseline — Phase 1: Electron Shell + Design System

## What this phase produces
A clickable Electron app that opens a window showing the exact Baseline UI — sidebar, tabs, correct fonts, correct colours, light/dark toggle. No functionality yet. Just the shell that looks exactly right.

## End state checklist
- [ ] `npm run dev` opens an Electron window
- [ ] Window shows sidebar + 3 tabs (Brain Dump, AI Versions, Writing)
- [ ] Dark/Light toggle in titlebar switches the theme
- [ ] Fonts load correctly (Lora for editor, system-ui for chrome)
- [ ] All colours match the design system exactly
- [ ] No errors in console

---

## Step 1 — Bootstrap the project

Run this exact command in an empty directory:

```bash
npm create electron-vite@latest baseline -- --template react
cd baseline
npm install
npm install @fontsource/lora
```

This gives you: Electron + React + Vite wired together. The folder structure after bootstrap will be:

```
baseline/
├── electron/
│   ├── main.js
│   └── preload.js
├── src/
│   ├── App.jsx
│   ├── App.css
│   ├── main.jsx
│   └── index.css
├── index.html
├── package.json
└── vite.config.js
```

---

## Step 2 — Configure the Electron window

Replace the entire contents of `electron/main.js` with:

```js
import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win

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

  win.on('ready-to-show', () => {
    win.show()
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
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
```

Replace the entire contents of `electron/preload.js` with:

```js
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
})
```

---

## Step 3 — Create the global design system CSS

Create a new file at `src/styles/theme.css` with these exact contents:

```css
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&display=swap');

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
  user-select: none;
}

/* ─── DARK MODE (default) ─────────────────────────────── */
.dark {
  --bg:            #0E0C0A;
  --bg2:           #0A0908;
  --bg3:           #141210;
  --bg4:           #1A1612;
  --border:        #1E1A16;
  --border2:       #2A2520;
  --text:          #E8E4DC;
  --text2:         #6A6560;
  --text3:         #3A3530;
  --accent:        #C9A84C;
  --accent-bg:     #C9A84C18;
  --accent-border: #C9A84C44;
  --ghost-dim-text:  #2A2520;
  --ghost-y-bg:      #5C4A1E22;
  --ghost-y-text:    #6A5A2E;
  --ghost-o-bg:      #6B3D1A22;
  --ghost-o-text:    #7A4D2A;
  --ghost-g-bg:      #1E4A2E33;
  --ghost-g-text:    #2A6A4E;
  --logo-color:    #C9A84C;
  --status-dot:    #2A6A4E;
}

/* ─── LIGHT MODE ──────────────────────────────────────── */
.light {
  --bg:            #F5F2EC;
  --bg2:           #EFEBE3;
  --bg3:           #E8E3DA;
  --bg4:           #FFFFFF;
  --border:        #DDD8CE;
  --border2:       #CCC7BC;
  --text:          #1A1814;
  --text2:         #6A6560;
  --text3:         #A8A39A;
  --accent:        #8B6A1A;
  --accent-bg:     #8B6A1A12;
  --accent-border: #8B6A1A33;
  --ghost-dim-text:  #C8C3BA;
  --ghost-y-bg:      #F5E8C0;
  --ghost-y-text:    #7A5A1A;
  --ghost-o-bg:      #F5DCC0;
  --ghost-o-text:    #7A3A1A;
  --ghost-g-bg:      #C8E8D0;
  --ghost-g-text:    #1A5A2E;
  --logo-color:    #8B6A1A;
  --status-dot:    #1A5A2E;
}

/* ─── TRANSITIONS ─────────────────────────────────────── */
.app-root {
  transition: background 0.2s ease, color 0.2s ease;
  background: var(--bg);
  color: var(--text);
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

---

## Step 4 — Replace index.css

Replace the entire contents of `src/index.css` with:

```css
html, body, #root {
  height: 100%;
  width: 100%;
  overflow: hidden;
}
```

---

## Step 5 — Create the Titlebar component

Create `src/components/Titlebar.jsx`:

```jsx
import styles from './Titlebar.module.css'

export default function Titlebar({ theme, onToggleTheme }) {
  return (
    <div className={styles.titlebar}>
      <div className={styles.dots}>
        <span className={styles.dot} style={{ background: '#FF5F57' }} />
        <span className={styles.dot} style={{ background: '#FEBC2E' }} />
        <span className={styles.dot} style={{ background: '#28C840' }} />
      </div>
      <span className={styles.appname}>B A S E L I N E</span>
      <div className={styles.toggle}>
        <button
          className={`${styles.toggleBtn} ${theme === 'dark' ? styles.active : ''}`}
          onClick={() => onToggleTheme('dark')}
        >
          Dark
        </button>
        <button
          className={`${styles.toggleBtn} ${theme === 'light' ? styles.active : ''}`}
          onClick={() => onToggleTheme('light')}
        >
          Light
        </button>
      </div>
    </div>
  )
}
```

Create `src/components/Titlebar.module.css`:

```css
.titlebar {
  height: 38px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 8px;
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.dots {
  display: flex;
  gap: 6px;
  -webkit-app-region: no-drag;
}

.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  display: block;
}

.appname {
  color: var(--text3);
  font-size: 12px;
  font-weight: 500;
  margin: 0 auto;
  letter-spacing: 0.08em;
}

.toggle {
  background: var(--bg4);
  border: 1px solid var(--border2);
  border-radius: 20px;
  padding: 3px;
  display: flex;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.toggleBtn {
  border: none;
  background: none;
  padding: 3px 10px;
  border-radius: 16px;
  font-size: 10px;
  cursor: pointer;
  color: var(--text2);
  font-family: inherit;
  transition: all 0.2s;
}

.toggleBtn.active {
  background: var(--accent);
  color: var(--bg);
}
```

---

## Step 6 — Create the Sidebar component

Create `src/components/Sidebar.jsx`:

```jsx
import styles from './Sidebar.module.css'

const MOCK_PROJECTS = [
  { id: '1', name: 'Masters SOP', date: 'today' },
  { id: '2', name: 'Research abstract', date: '2d ago' },
  { id: '3', name: 'Lit review intro', date: '5d ago' },
  { id: '4', name: 'Cover letter', date: '1w ago' },
]

export default function Sidebar({ activeProject, onSelectProject, onNewProject }) {
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
        {MOCK_PROJECTS.map(project => (
          <div
            key={project.id}
            className={`${styles.project} ${activeProject === project.id ? styles.active : ''}`}
            onClick={() => onSelectProject(project.id)}
          >
            <span className={styles.projectDot} />
            <span className={styles.projectName}>{project.name}</span>
            <span className={styles.projectDate}>{project.date}</span>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        v0.1.0 — open source
      </div>
    </div>
  )
}
```

Create `src/components/Sidebar.module.css`:

```css
.sidebar {
  width: 210px;
  background: var(--bg2);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100%;
}

.top {
  padding: 16px 14px 12px;
  border-bottom: 1px solid var(--border);
}

.logo {
  color: var(--logo-color);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.06em;
  margin-bottom: 14px;
}

.newBtn {
  width: 100%;
  background: var(--bg4);
  border: 1px solid var(--border2);
  border-radius: 7px;
  color: var(--accent);
  font-size: 12px;
  padding: 7px 10px;
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: inherit;
}

.newBtn:hover {
  background: var(--bg3);
}

.plus {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  background: var(--accent-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  font-size: 14px;
  line-height: 1;
}

.sectionLabel {
  font-size: 10px;
  color: var(--text3);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 14px 14px 6px;
}

.projectList {
  flex: 1;
  overflow-y: auto;
}

.project {
  padding: 7px 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 9px;
  border-right: 2px solid transparent;
}

.project:hover {
  background: var(--bg3);
}

.project.active {
  background: var(--bg3);
  border-right-color: var(--accent);
}

.projectDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border2);
  flex-shrink: 0;
}

.project.active .projectDot {
  background: var(--accent);
}

.projectName {
  font-size: 13px;
  color: var(--text2);
  flex: 1;
}

.project.active .projectName {
  color: var(--text);
}

.projectDate {
  font-size: 10px;
  color: var(--text3);
}

.footer {
  padding: 14px;
  border-top: 1px solid var(--border);
  font-size: 10px;
  color: var(--text3);
  letter-spacing: 0.06em;
}
```

---

## Step 7 — Create the ProjectView shell (tabs only)

Create `src/components/ProjectView.jsx`:

```jsx
import { useState } from 'react'
import styles from './ProjectView.module.css'

const TABS = [
  { id: 'braindump', label: 'Brain dump' },
  { id: 'versions', label: 'AI versions' },
  { id: 'writing', label: 'Writing' },
]

export default function ProjectView({ projectId }) {
  const [activeTab, setActiveTab] = useState('writing')

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === 'braindump' && (
          <div className={styles.placeholder}>
            Brain Dump tab — Phase 3
          </div>
        )}
        {activeTab === 'versions' && (
          <div className={styles.placeholder}>
            AI Versions tab — Phase 3
          </div>
        )}
        {activeTab === 'writing' && (
          <div className={styles.placeholder}>
            Writing Editor — Phase 4
          </div>
        )}
      </div>
    </div>
  )
}
```

Create `src/components/ProjectView.module.css`:

```css
.container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}

.tabs {
  display: flex;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 0 24px;
  flex-shrink: 0;
}

.tab {
  font-size: 12px;
  color: var(--text2);
  padding: 10px 14px;
  cursor: pointer;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  white-space: nowrap;
  font-family: inherit;
  transition: color 0.15s;
}

.tab:hover {
  color: var(--text);
}

.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text3);
}
```

---

## Step 8 — Wire everything together in App.jsx

Replace the entire contents of `src/App.jsx` with:

```jsx
import { useState } from 'react'
import '../src/styles/theme.css'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import ProjectView from './components/ProjectView'
import styles from './App.module.css'

export default function App() {
  const [theme, setTheme] = useState('dark')
  const [activeProject, setActiveProject] = useState('1')

  return (
    <div className={`app-root ${theme}`}>
      <Titlebar theme={theme} onToggleTheme={setTheme} />
      <div className={styles.body}>
        <Sidebar
          activeProject={activeProject}
          onSelectProject={setActiveProject}
          onNewProject={() => console.log('new project')}
        />
        <ProjectView projectId={activeProject} />
      </div>
    </div>
  )
}
```

Create `src/App.module.css`:

```css
.body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
```

---

## Step 9 — Run it

```bash
npm run dev
```

An Electron window should open. You should see:
- Warm dark background
- Titlebar with traffic light dots and "BASELINE" centered
- Dark/Light toggle in top right — clicking it switches the entire app theme
- Sidebar on the left with "baseline." logo, "+ New project" button, and 4 mock projects
- Main area with 3 tabs and placeholder text

If it looks exactly like the mockup (minus real content), Phase 1 is done.

---

## Common issues

**Fonts not loading:** Make sure you have internet access the first run. Lora is loaded from Google Fonts. In production you'll bundle it.

**White flash on startup:** Normal in dev mode. In production with `backgroundColor: '#0E0C0A'` set in main.js it won't happen.

**`-webkit-app-region: drag` not working:** Only works in the packaged app or when `frame: false` / `titleBarStyle: 'hiddenInset'` is set. Already configured correctly in main.js above.
