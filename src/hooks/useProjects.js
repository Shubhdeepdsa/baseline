import { useState, useEffect } from 'react'

export function useProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadProjects() {
    const result = await window.electron.getProjects()
    setProjects(result)
    setLoading(false)
  }

  async function createProject(name) {
    if (!name || !name.trim()) return { error: 'Name is required' }
    const result = await window.electron.createProject(name.trim())
    if (!result.error) {
      await loadProjects()
    }
    return result
  }

  useEffect(() => {
    loadProjects()
  }, [])

  return { projects, loading, createProject, reload: loadProjects }
}
