import { contextBridge, ipcRenderer } from 'electron'

// Set theme immediately to avoid flash — runs before React
ipcRenderer.invoke('getSettings').then(settings => {
  document.documentElement.setAttribute('data-theme', settings.theme || 'dark')
})

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,

  // Debug
  consoleError: (errStr) => ipcRenderer.invoke('consoleError', errStr),

  // Projects
  getProjects: () => ipcRenderer.invoke('getProjects'),
  createProject: (name) => ipcRenderer.invoke('createProject', name),
  deleteProject: (projectId) => ipcRenderer.invoke('deleteProject', projectId),

  // Files
  readFile: (projectId, type) => ipcRenderer.invoke('readFile', projectId, type),
  saveFile: (projectId, type, content) => ipcRenderer.invoke('saveFile', projectId, type, content),

  // AI Versions
  getVersions: (projectId) => ipcRenderer.invoke('getVersions', projectId),
  saveVersion: (projectId, content) => ipcRenderer.invoke('saveVersion', projectId, content),
  readVersion: (projectId, filename) => ipcRenderer.invoke('readVersion', projectId, filename),
  deleteVersion: (projectId, filename) => ipcRenderer.invoke('deleteVersion', projectId, filename),

  // Brain Dumps
  getBrainDumps: (projectId) => ipcRenderer.invoke('getBrainDumps', projectId),
  createBrainDump: (projectId, name) => ipcRenderer.invoke('createBrainDump', projectId, name),
  deleteBrainDump: (projectId, filename) => ipcRenderer.invoke('deleteBrainDump', projectId, filename),

  // Settings
  getSettings: () => ipcRenderer.invoke('getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('saveSettings', settings),

  // Export
  exportFile: (projectId, format, content) => ipcRenderer.invoke('exportFile', projectId, format, content),
})
