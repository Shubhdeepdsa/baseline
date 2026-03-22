import { useState } from 'react'
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

  const theme = settings.theme || 'dark'

  async function handleThemeToggle(newTheme) {
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
