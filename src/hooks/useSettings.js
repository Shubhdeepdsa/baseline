import { useState, useEffect } from 'react'
import { SETTINGS_SCHEMA } from '../utils/settingsSchema'

export function useSettings() {
  const defaultSettings = SETTINGS_SCHEMA.reduce((acc, schema) => {
    if (schema.default !== undefined) acc[schema.id] = schema.default
    return acc
  }, {
    theme: 'dark',
    ghostBehavior: 'hide',
    ghostSplitOrientation: 'horizontal',
    ghostSplitRatioHorizontal: 0.62,
    ghostSplitRatioVertical: 0.58,
    ghostRemovedVisibility: 'show',
  })

  const [settings, setSettings] = useState(defaultSettings)

  useEffect(() => {
    window.electron.getSettings().then(s => setSettings({ ...defaultSettings, ...s }))
  }, [])

  async function saveSetting(key, value) {
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    await window.electron.saveSettings({ [key]: value })
  }

  return { settings, saveSetting }
}
