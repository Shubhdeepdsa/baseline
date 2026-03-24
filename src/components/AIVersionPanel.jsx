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

export default function AIVersionPanel({ projectId, activeVersionFilename, onActiveVersionChange }) {
  const [versions, setVersions] = useState([])
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [selectedContent, setSelectedContent] = useState('')
  const [pasteContent, setPasteContent] = useState('')
  const [showPasteArea, setShowPasteArea] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!projectId) return
    loadVersions()
  }, [projectId])

  async function loadVersions() {
    const result = await window.electron.getVersions(projectId)
    setVersions(result)
    
    // Default to selecting the active version if nothing is selected or if project changed
    if (result.length > 0 && (!selectedVersion || !result.find(v => v.filename === selectedVersion))) {
      const versionToSelect = result.find(v => v.filename === activeVersionFilename) || result[0]
      selectVersion(versionToSelect)
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
    
    // Update parent about the new active version
    if (onActiveVersionChange) {
      onActiveVersionChange(newVersion.filename)
    }
    
    await loadVersions()
  }

  async function handleSetActive(filename) {
    await window.electron.saveFile(projectId, 'active-version', filename)
    if (onActiveVersionChange) {
      onActiveVersionChange(filename)
    }
  }

  async function handleDeleteVersion(filename, e) {
    e.stopPropagation()
    await window.electron.deleteVersion(projectId, filename)
    await loadVersions()
  }

  async function handleCopy() {
    if (!selectedContent) return
    try {
      await navigator.clipboard.writeText(selectedContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
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
                <span className={`${styles.badge} ${activeVersionFilename === version.filename ? styles.activeBadge : styles.inactiveBadge}`}>
                  v{version.versionNumber}{activeVersionFilename === version.filename ? ' — active' : ''}
                </span>
                <div>
                  <div className={styles.versionDate}>{formatDate(version.createdAt)}</div>
                </div>
              </div>
              <div className={styles.versionRight}>
                {activeVersionFilename === version.filename
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
        {selectedContent ? (
          <>
            <div className={styles.previewHeader}>
              <span className={styles.previewTitle}>
                {versions.find(v => v.filename === selectedVersion)?.versionNumber 
                  ? `Version ${versions.find(v => v.filename === selectedVersion).versionNumber}`
                  : 'Preview'}
              </span>
              <button 
                className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>
            </div>
            <div className={styles.preview}>{selectedContent}</div>
          </>
        ) : (
          <div className={styles.previewEmpty}>Select a version to preview it</div>
        )}
      </div>
    </div>
  )
}
