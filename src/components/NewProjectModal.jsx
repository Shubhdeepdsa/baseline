import { useState } from 'react'
import styles from './NewProjectModal.module.css'

export default function NewProjectModal({ onConfirm, onCancel }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!name.trim()) { setError('Please enter a project name'); return }
    const result = await onConfirm(name.trim())
    if (result?.error) setError(result.error)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>New project</h2>
        <p className={styles.subtitle}>Give your writing project a name.</p>
        <input
          className={styles.input}
          type="text"
          placeholder="e.g. Masters SOP"
          value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.createBtn} onClick={handleCreate}>Create</button>
        </div>
      </div>
    </div>
  )
}
