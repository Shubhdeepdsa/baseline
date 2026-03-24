import { useState, useEffect } from 'react'
import styles from './ProjectView.module.css'
import BrainDumpEditor from './BrainDumpEditor'
import AIVersionPanel from './AIVersionPanel'
import WritingEditor from './WritingEditor'
import { useSettings } from '../hooks/useSettings'

const TABS = [
  { id: 'braindump', label: 'Brain dump' },
  { id: 'versions', label: 'AI versions' },
  { id: 'writing', label: 'Writing' },
]

export default function ProjectView({ projectId }) {
  const { settings, saveSetting } = useSettings()
  const [activeTab, setActiveTab] = useState('writing')

  // Restore active tab from settings once settings load
  useEffect(() => {
    if (settings.lastTabId) {
      setActiveTab(settings.lastTabId)
    }
  }, [settings.lastTabId])

  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    saveSetting('lastTabId', tabId)
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
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === 'braindump' && (
          <BrainDumpEditor projectId={projectId} />
        )}
        {activeTab === 'versions' && (
          <AIVersionPanel
            projectId={projectId}
            activeVersionFilename={activeVersionFilename}
            onActiveVersionChange={handleActiveVersionChange}
          />
        )}
        {activeTab === 'writing' && (
          <WritingEditor
            projectId={projectId}
            activeVersionContent={activeVersionContent}
          />
        )}
      </div>
    </div>
  )
}
