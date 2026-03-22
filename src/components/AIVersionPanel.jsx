import { useState, useEffect } from 'react'
import styles from './AIVersionPanel.module.css'

function formatDate(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) {
    return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  if (diffHours < 48) return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function AIVersionPanel({ projectId, onActiveVersionChange }) {
  const [versions, setVersions] = useState([])
  const [activeVersion, setActiveVersion] = useState(null)
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [selectedContent, setSelectedContent] = useState('')
  const [pasteContent, setPasteContent] = useState('')
  const [showPasteArea, setShowPasteArea] = useState(false)

  useEffect(() => {
    if (!projectId) return
    loadVersions()
  }, [projectId])

  async function loadVersions() {
    const result = await window.electron.getVersions(projectId)
    setVersions(result)
    
    if (result.length > 0) {
      const activeResult = await window.electron.readFile(projectId, 'active-version')
      const savedActiveFilename = activeResult.content?.trim()
      
      const savedVersionObj = result.find(v => v.filename === savedActiveFilename)
      const versionObj = savedVersionObj || result[0]

      setActiveVersion(versionObj.filename)
      selectVersion(versionObj)
      
      if (!savedVersionObj) {
        await window.electron.saveFile(projectId, 'active-version', versionObj.filename)
      }
      
      if (onActiveVersionChange) {
        const contentResult = await window.electron.readVersion(projectId, versionObj.filename)
        onActiveVersionChange(contentResult.content || '')
      }
    } else {
      setActiveVersion(null)
      setSelectedVersion(null)
      setSelectedContent('')
      if (onActiveVersionChange) onActiveVersionChange('')
    }
  }

  async function selectVersion(version) {
    setSelectedVersion(version.filename)
    const result = await window.electron.readVersion(projectId, version.filename)
    setSelectedContent(result.content || '')
  }

  async function handleSaveVersion() {
    if (!pasteContent.trim()) return
    const newVersion = await window.electron.saveVersion(projectId, pasteContent.trim())
    await window.electron.saveFile(projectId, 'active-version', newVersion.filename)
    setPasteContent('')
    setShowPasteArea(false)
    await loadVersions()
  }

  async function handleSetActive(filename) {
    setActiveVersion(filename)
    await window.electron.saveFile(projectId, 'active-version', filename)
    const result = await window.electron.readVersion(projectId, filename)
    if (onActiveVersionChange) {
      onActiveVersionChange(result.content || '')
    }
  }

  async function handleDeleteVersion(filename, e) {
    e.stopPropagation()
    await window.electron.deleteVersion(projectId, filename)
    await loadVersions()
  }

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.header}>
          <span className={styles.title}>AI versions</span>
          <button
            className={styles.saveBtn}
            onClick={() => setShowPasteArea(!showPasteArea)}
          >
            + Save new version
          </button>
        </div>

        {showPasteArea && (
          <div className={styles.pasteArea}>
            <textarea
              className={styles.pasteTextarea}
              value={pasteContent}
              onChange={e => setPasteContent(e.target.value)}
              placeholder="Paste the AI-generated text here..."
              autoFocus
            />
            <div className={styles.pasteActions}>
              <button className={styles.cancelBtn} onClick={() => { setShowPasteArea(false); setPasteContent('') }}>
                Cancel
              </button>
              <button className={styles.confirmBtn} onClick={handleSaveVersion}>
                Save version
              </button>
            </div>
          </div>
        )}

        <div className={styles.versionList}>
          {versions.length === 0 && (
            <div className={styles.empty}>
              No versions yet. Paste your AI output and save it as a version.
            </div>
          )}
          {versions.map((version) => (
            <div
              key={version.filename}
              className={`${styles.versionItem} ${selectedVersion === version.filename ? styles.selected : ''}`}
              onClick={() => selectVersion(version)}
            >
              <div className={styles.versionLeft}>
                <span className={`${styles.badge} ${activeVersion === version.filename ? styles.activeBadge : styles.inactiveBadge}`}>
                  v{version.versionNumber}{activeVersion === version.filename ? ' — active' : ''}
                </span>
                <div>
                  <div className={styles.versionDate}>{formatDate(version.createdAt)}</div>
                </div>
              </div>
              <div className={styles.versionRight}>
                {activeVersion === version.filename
                  ? <span className={styles.ghostLabel}>ghost source</span>
                  : <button
                      className={styles.setActiveBtn}
                      onClick={(e) => { e.stopPropagation(); handleSetActive(version.filename) }}
                    >
                      Set active
                    </button>
                }
                <button
                  className={styles.deleteBtn}
                  onClick={(e) => handleDeleteVersion(version.filename, e)}
                  title="Delete version"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.right}>
        {selectedContent
          ? <div className={styles.preview}>{selectedContent}</div>
          : <div className={styles.previewEmpty}>Select a version to preview it</div>
        }
      </div>
    </div>
  )
}
