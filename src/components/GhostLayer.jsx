import styles from './GhostLayer.module.css'

export default function GhostLayer({ ghosts }) {
  const visibleGhosts = ghosts.filter(g => !g.covered)

  if (visibleGhosts.length === 0) return null

  return (
    <div className={styles.wrapper}>
      {ghosts.map((ghost, i) => (
        <div
          key={i}
          className={`${styles.ghost} ${styles[ghost.state]} ${ghost.covered ? styles.covered : ''}`}
        >
          {ghost.text}
        </div>
      ))}
    </div>
  )
}
