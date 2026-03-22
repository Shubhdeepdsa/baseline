import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,

  // Projects
  getProjects: () => ipcRenderer.invoke('getProjects'),
  createProject: (name) => ipcRenderer.invoke('createProject', name),

  // Files
  readFile: (projectId, type) => ipcRenderer.invoke('readFile', projectId, type),
  saveFile: (projectId, type, content) => ipcRenderer.invoke('saveFile', projectId, type, content),

  // AI Versions
  getVersions: (projectId) => ipcRenderer.invoke('getVersions', projectId),
  saveVersion: (projectId, content) => ipcRenderer.invoke('saveVersion', projectId, content),
  readVersion: (projectId, filename) => ipcRenderer.invoke('readVersion', projectId, filename),
  deleteVersion: (projectId, filename) => ipcRenderer.invoke('deleteVersion', projectId, filename),

  // Settings
  getSettings: () => ipcRenderer.invoke('getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('saveSettings', settings),

  // Export
  exportFile: (projectId, format, content) => ipcRenderer.invoke('exportFile', projectId, format, content),
})
