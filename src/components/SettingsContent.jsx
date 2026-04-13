import { useState } from 'react'
import styles from './SettingsContent.module.css'
import { SETTINGS_SCHEMA } from '../utils/settingsSchema'

export default function SettingsContent({ settings, saveSetting, currentTheme, onThemeToggle }) {
  // Use schema to group settings
  const groupedSettings = SETTINGS_SCHEMA.reduce((acc, setting) => {
    if (!acc[setting.category]) acc[setting.category] = []
    acc[setting.category].push(setting)
    return acc
  }, {})

  const handleToggle = (id, currentValue) => {
    saveSetting(id, !currentValue)
  }

  const handleThemeSwitch = () => {
    onThemeToggle(currentTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {Object.entries(groupedSettings).map(([category, items]) => (
            <div key={category} className={styles.section}>
              <h3 className={styles.sectionTitle}>{category}</h3>
              <div className={styles.settingList}>
                {items.map(setting => {
                  const currentValue = settings[setting.id] ?? setting.default
                  
                  return (
                    <div key={setting.id} className={styles.settingItem}>
                      <div className={styles.settingInfo}>
                        <div className={styles.settingTitleWrap}>
                          {setting.icon && <span className={styles.settingIcon} dangerouslySetInnerHTML={{__html: setting.icon}} />}
                          <span className={styles.settingTitle}>{setting.title}</span>
                        </div>
                        <span className={styles.settingDesc}>{setting.description}</span>
                      </div>
                      <div className={styles.settingControl}>
                        {setting.type === 'theme-toggle' && (
                          <button 
                            className={`${styles.themeToggle} ${currentTheme === 'dark' ? styles.isDark : ''}`} 
                            onClick={handleThemeSwitch}
                          >
                            <div className={styles.themeKnob}>
                              {currentTheme === 'dark' ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                              )}
                            </div>
                          </button>
                        )}
                        {setting.type === 'boolean' && (
                          <button 
                            className={`${styles.toggle} ${currentValue ? styles.toggleOn : ''}`}
                            onClick={() => handleToggle(setting.id, currentValue)}
                          >
                            <div className={styles.toggleKnob} />
                          </button>
                        )}
                        {setting.type === 'select' && (
                          <select 
                            className={styles.select}
                            value={currentValue}
                            onChange={(e) => saveSetting(setting.id, e.target.value)}
                          >
                            {setting.options.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
