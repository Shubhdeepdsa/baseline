import { useState, useEffect } from 'react'

export function useSettings() {
  const [settings, setSettings] = useState({ theme: 'dark' })

  useEffect(() => {
    window.electron.getSettings().then(s => setSettings(s))
  }, [])

  async function saveSetting(key, value) {
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    await window.electron.saveSettings({ [key]: value })
  }

  return { settings, saveSetting }
}
