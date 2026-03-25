import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'
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

export default function Sidebar({ projects, activeProject, onSelectProject, onNewProject, onDeleteProject }) {
  const [searchQuery, setSearchQuery] = useState('')

  const fuse = useMemo(() => {
    return new Fuse(projects, {
      keys: ['name'],
      threshold: 0.4,
      distance: 100,
    })
  }, [projects])

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects
    return fuse.search(searchQuery).map(result => result.item)
  }, [searchQuery, projects, fuse])

  return (
    <div className={styles.sidebar}>
      <div className={styles.top}>
        <div className={styles.logo}>
          <span className={styles.word}>baseline</span>
          <span className={styles.cursor}>_</span>
        </div>
        <button className={styles.newBtn} onClick={onNewProject}>
          <span className={styles.plus}>+</span>
          New project
        </button>

        <div className={styles.searchContainer}>
          <div className={styles.searchIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              className={styles.clearBtn}
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className={styles.sectionLabel}>Projects</div>

      <div className={styles.projectList}>
        {projects.length === 0 ? (
          <div className={styles.empty}>No projects yet.</div>
        ) : filteredProjects.length === 0 ? (
          <div className={styles.empty}>No projects match "{searchQuery}"</div>
        ) : (
          filteredProjects.map(project => (
            <div
              key={project.id}
              className={`${styles.project} ${activeProject === project.id ? styles.active : ''}`}
              onClick={() => onSelectProject(project.id)}
            >
              <span className={styles.projectDot} />
              <span className={styles.projectName}>{project.name}</span>
              <div className={styles.projectActions}>
                <span className={styles.projectDate}>{formatDate(project.modifiedAt)}</span>
                <button 
                  className={styles.deleteBtn}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteProject(project.id)
                  }}
                  title="Delete project"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className={styles.footer}>v1.0.0 — open source</div>
    </div>
  )
}

