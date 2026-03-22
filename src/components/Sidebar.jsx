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
