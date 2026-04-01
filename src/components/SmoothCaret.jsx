import styles from './SmoothCaret.module.css'

export default function SmoothCaret({ caret }) {
  const { visible, left, top, height, blinking } = caret

  return (
    <div
      aria-hidden="true"
      className={`${styles.caret} ${visible ? styles.visible : ''} ${blinking ? styles.blinking : ''}`}
      style={{
        transform: `translate3d(${Math.round(left) - 1}px, ${Math.round(top)}px, 0)`,
        height: `${Math.max(18, Math.round(height))}px`,
      }}
    />
  )
}
