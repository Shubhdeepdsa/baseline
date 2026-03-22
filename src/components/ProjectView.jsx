import { useState } from 'react'
import styles from './ProjectView.module.css'
import BrainDumpEditor from './BrainDumpEditor'
import AIVersionPanel from './AIVersionPanel'

const TABS = [
  { id: 'braindump', label: 'Brain dump' },
  { id: 'versions', label: 'AI versions' },
  { id: 'writing', label: 'Writing' },
]

export default function ProjectView({ projectId }) {
  const [activeTab, setActiveTab] = useState('writing')
  const [activeVersionContent, setActiveVersionContent] = useState('')

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
          <BrainDumpEditor projectId={projectId} />
        )}
        {activeTab === 'versions' && (
          <AIVersionPanel
            projectId={projectId}
            onActiveVersionChange={setActiveVersionContent}
          />
        )}
        {activeTab === 'writing' && (
          <div className={styles.placeholder}>
            Writing Editor — coming in Phase 4
            {activeVersionContent && (
              <p style={{ marginTop: 12, fontSize: 11, opacity: 0.5 }}>
                Active version loaded ({activeVersionContent.length} chars)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
