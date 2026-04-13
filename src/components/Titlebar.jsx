import styles from './Titlebar.module.css'

export default function Titlebar() {
  return (
    <div className={styles.titlebar}>
      {/* <div className={styles.dots}>
        <span className={styles.dot} style={{ background: '#FF5F57' }} />
        <span className={styles.dot} style={{ background: '#FEBC2E' }} />
        <span className={styles.dot} style={{ background: '#28C840' }} />
      </div> */}
      <span className={styles.appname}>B A S E L I N E</span>
    </div>
  )
}
