import { useState, useEffect } from 'react'
import styles from './ProjectView.module.css'
import BrainDumpEditor from './BrainDumpEditor'
import AIVersionPanel from './AIVersionPanel'
import WritingEditor from './WritingEditor'
import { useSettings } from '../hooks/useSettings'

import SettingsContent from './SettingsContent'

const TABS = [
  { id: 'braindump', label: 'Brain dump' },
  { id: 'versions', label: 'AI versions' },
  { id: 'writing', label: 'Writing' },
]

export default function ProjectView({ projectId, showSettingsTab, onCloseSettings, theme, onThemeToggle, settings, saveSetting }) {
  const [activeTab, setActiveTab] = useState('writing')

  // Derive visible tabs
  const visibleTabs = projectId ? [...TABS] : []
  if (showSettingsTab) {
    visibleTabs.push({ id: 'settings', label: 'Settings' })
  }

  // Restore active tab from settings once settings load
  useEffect(() => {
    if (showSettingsTab) {
      setActiveTab('settings')
    } else if (settings.lastTabId && projectId) {
      setActiveTab(settings.lastTabId)
    }
  }, [settings.lastTabId, showSettingsTab, projectId])

  const handleTabChange = (tabId) => {
    if (tabId !== 'settings' && activeTab === 'settings') {
      onCloseSettings?.()
    }
    setActiveTab(tabId)
    if (tabId !== 'settings') saveSetting('lastTabId', tabId)
  }
  const [activeVersionFilename, setActiveVersionFilename] = useState(null)
  const [activeVersionContent, setActiveVersionContent] = useState('')

  // Load active version data whenever projectId changes
  useEffect(() => {
    if (!projectId) return

    async function loadActiveData() {
      // 1. Get all versions for this project
      const versions = await window.electron.getVersions(projectId)
      if (versions.length === 0) {
        setActiveVersionFilename(null)
        setActiveVersionContent('')
        return
      }

      // 2. See which one is marked as active in the file system
      const activeResult = await window.electron.readFile(projectId, 'active-version')
      const savedActiveFilename = activeResult.content?.trim()
      
      const savedVersionObj = versions.find(v => v.filename === savedActiveFilename)
      const versionObj = savedVersionObj || versions[0]

      setActiveVersionFilename(versionObj.filename)

      // 3. If it wasn't already marked active on disk, mark it now
      if (!savedVersionObj) {
        await window.electron.saveFile(projectId, 'active-version', versionObj.filename)
      }

      // 4. Load its actual content
      const contentResult = await window.electron.readVersion(projectId, versionObj.filename)
      setActiveVersionContent(contentResult.content || '')
    }

    loadActiveData()
  }, [projectId])

  const handleActiveVersionChange = async (filename) => {
    setActiveVersionFilename(filename)
    const result = await window.electron.readVersion(projectId, filename)
    setActiveVersionContent(result.content || '')
  }

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        {visibleTabs.map(tab => (
          <div key={tab.id} className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}>
            <button
              className={styles.tabBtn}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
            {tab.id === 'settings' && (
              <button className={styles.tabCloseBtn} onClick={() => {
                if (activeTab === 'settings') {
                  setActiveTab(projectId ? 'writing' : null)
                }
                onCloseSettings?.()
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            )}
          </div>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === 'settings' && (
          <SettingsContent 
            settings={settings}
            saveSetting={saveSetting}
            currentTheme={theme}
            onThemeToggle={onThemeToggle}
          />
        )}
        {activeTab === 'braindump' && projectId && (
          <BrainDumpEditor projectId={projectId} />
        )}
        {activeTab === 'versions' && projectId && (
          <AIVersionPanel
            projectId={projectId}
            activeVersionFilename={activeVersionFilename}
            onActiveVersionChange={handleActiveVersionChange}
          />
        )}
        {activeTab === 'writing' && projectId && (
          <WritingEditor
            projectId={projectId}
            activeVersionFilename={activeVersionFilename}
            activeVersionContent={activeVersionContent}
            settings={settings}
            saveSetting={saveSetting}
          />
        )}
      </div>
    </div>
  )
}
