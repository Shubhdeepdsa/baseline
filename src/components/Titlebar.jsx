import styles from './Titlebar.module.css'

export default function Titlebar({
  theme,
  onToggleTheme,
  ghostSelectionMode = 'sentence',
  onGhostSelectionModeChange,
}) {
  return (
    <div className={styles.titlebar}>
      {/* <div className={styles.dots}>
        <span className={styles.dot} style={{ background: '#FF5F57' }} />
        <span className={styles.dot} style={{ background: '#FEBC2E' }} />
        <span className={styles.dot} style={{ background: '#28C840' }} />
      </div> */}
      <span className={styles.appname}>B A S E L I N E</span>
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Ghost</span>
          <div className={styles.toggle}>
            <button
              className={`${styles.toggleBtn} ${ghostSelectionMode === 'sentence' ? styles.active : ''}`}
              onClick={() => onGhostSelectionModeChange?.('sentence')}
            >
              Sentence
            </button>
            <button
              className={`${styles.toggleBtn} ${ghostSelectionMode === 'exact' ? styles.active : ''}`}
              onClick={() => onGhostSelectionModeChange?.('exact')}
            >
              Exact
            </button>
          </div>
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Theme</span>
          <div className={styles.toggle}>
            <button
              className={`${styles.toggleBtn} ${theme === 'dark' ? styles.active : ''}`}
              onClick={() => onToggleTheme('dark')}
            >
              Dark
            </button>
            <button
              className={`${styles.toggleBtn} ${theme === 'light' ? styles.active : ''}`}
              onClick={() => onToggleTheme('light')}
            >
              Light
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
