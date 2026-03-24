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

export default function Sidebar({ projects, activeProject, onSelectProject, onNewProject, onDeleteProject }) {
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
        ))}
      </div>

      <div className={styles.footer}>v0.1.0 — open source</div>
    </div>
  )
}
