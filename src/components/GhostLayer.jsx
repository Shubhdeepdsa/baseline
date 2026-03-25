import styles from './GhostLayer.module.css'

export default function GhostLayer({ ghosts, behavior = 'hide' }) {
  const allCovered = ghosts.every(g => g.covered)

  if (allCovered && behavior === 'hide') return null
  if (ghosts.length === 0) return null

  return (
    <div className={styles.wrapper}>
      {ghosts.map((ghost, i) => (
        <div
          key={i}
          className={`${styles.ghost} ${styles[ghost.state]} ${ghost.covered ? `${styles.covered} ${styles[behavior]}` : ''}`}
        >
          {ghost.text}
        </div>
      ))}
    </div>
  )
}
