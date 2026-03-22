import { useState } from 'react'
import styles from './ProjectView.module.css'
import BrainDumpEditor from './BrainDumpEditor'
import AIVersionPanel from './AIVersionPanel'
import WritingEditor from './WritingEditor'

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
          <WritingEditor
            projectId={projectId}
            activeVersionContent={activeVersionContent}
          />
        )}
      </div>
    </div>
  )
}
