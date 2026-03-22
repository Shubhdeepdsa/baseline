import { useState, useEffect } from 'react'
import './styles/theme.css'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import ProjectView from './components/ProjectView'
import NewProjectModal from './components/NewProjectModal'
import { useProjects } from './hooks/useProjects'
import { useSettings } from './hooks/useSettings'
import styles from './App.module.css'

export default function App() {
  const { settings, saveSetting } = useSettings()
  const { projects, createProject, reload } = useProjects()
  const [activeProject, setActiveProject] = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)

  // We read the saved theme synchronously from a data attribute set by preload
  const savedTheme = document.documentElement.getAttribute('data-theme') || 'dark'
  const [theme, setTheme] = useState(savedTheme)

  async function handleThemeToggle(newTheme) {
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    await saveSetting('theme', newTheme)
  }

  async function handleCreateProject(name) {
    const result = await createProject(name)
    if (!result.error) {
      setActiveProject(result.id)
      setShowNewModal(false)
    }
    return result
  }

  // Auto-select first project if none selected
  if (!activeProject && projects.length > 0) {
    setActiveProject(projects[0].id)
  }

  useEffect(() => {
    if (activeProject) {
      const project = projects.find(p => p.id === activeProject)
      if (project) {
        document.title = `${project.name} — Baseline`
      }
    } else {
      document.title = 'Baseline'
    }
  }, [activeProject, projects])

  return (
    <div className={`app-root ${theme}`} style={{ position: 'relative' }}>
      <Titlebar theme={theme} onToggleTheme={handleThemeToggle} />
      <div className={styles.body}>
        <Sidebar
          projects={projects}
          activeProject={activeProject}
          onSelectProject={setActiveProject}
          onNewProject={() => setShowNewModal(true)}
        />
        {activeProject
          ? <ProjectView key={activeProject} projectId={activeProject} />
          : <div className={styles.empty}>
              <p>Create a project to get started.</p>
              <button className={styles.emptyBtn} onClick={() => setShowNewModal(true)}>
                + New project
              </button>
            </div>
        }
      </div>
      {showNewModal && (
        <NewProjectModal
          onConfirm={handleCreateProject}
          onCancel={() => setShowNewModal(false)}
        />
      )}
    </div>
  )
}
