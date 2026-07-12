import { describe, it, expect, beforeEach } from 'vitest'
import saveReducer, {
  setProjects, addProject, removeProject, switchProject,
  addSaveEntry, removeSaveEntry, setHistoryVisible, toggleHistory, setLoaded,
} from '../saveSlice'

interface SaveEntry {
  id: string
  name: string
  time: number
  data: Record<string, unknown>
}

interface Project {
  id: string
  name: string
  description: string
  saves: SaveEntry[]
}

interface SaveState {
  projects: Project[]
  currentProjectId: string | null
  historyVisible: boolean
  loaded: boolean
}

describe('saveSlice', () => {
  let initial: SaveState

  beforeEach(() => {
    initial = {
      projects: [],
      currentProjectId: null,
      historyVisible: false,
      loaded: false,
    }
  })

  const makeProject = (id: string, name: string, saves: SaveEntry[] = []): Project => ({
    id, name, description: `Desc for ${name}`, saves,
  })

  const makeSave = (id: string, name: string): SaveEntry => ({
    id, name, time: Date.now(), data: { key: 'value' },
  })

  describe('setProjects', () => {
    it('replaces projects and sets loaded', () => {
      const projects = [makeProject('p1', 'Proj1')]
      const state = saveReducer(initial, setProjects(projects))
      expect(state.projects).toEqual(projects)
      expect(state.loaded).toBe(true)
    })

    it('sets currentProjectId to first project when none selected', () => {
      const projects = [makeProject('p1', 'A'), makeProject('p2', 'B')]
      const state = saveReducer(initial, setProjects(projects))
      expect(state.currentProjectId).toBe('p1')
    })

    it('keeps existing currentProjectId if already set', () => {
      const projects = [makeProject('p1', 'A'), makeProject('p2', 'B')]
      const pre = { ...initial, currentProjectId: 'p2' }
      const state = saveReducer(pre, setProjects(projects))
      expect(state.currentProjectId).toBe('p2')
    })

    it('does not change currentProjectId when empty projects array', () => {
      const pre = { ...initial, currentProjectId: 'p1' }
      const state = saveReducer(pre, setProjects([]))
      expect(state.currentProjectId).toBe('p1')
    })
  })

  describe('addProject', () => {
    it('appends a project and switches to it', () => {
      const project = makeProject('p1', 'New Project')
      const state = saveReducer(initial, addProject(project))
      expect(state.projects).toHaveLength(1)
      expect(state.projects[0]).toEqual(project)
      expect(state.currentProjectId).toBe('p1')
    })

    it('appends to existing projects', () => {
      const pre = { ...initial, projects: [makeProject('p1', 'First')], currentProjectId: 'p1' }
      const project = makeProject('p2', 'Second')
      const state = saveReducer(pre, addProject(project))
      expect(state.projects).toHaveLength(2)
      expect(state.currentProjectId).toBe('p2')
    })
  })

  describe('removeProject', () => {
    it('removes a project by id', () => {
      const pre = { ...initial, projects: [makeProject('p1', 'A'), makeProject('p2', 'B')], currentProjectId: 'p1' }
      const state = saveReducer(pre, removeProject('p1'))
      expect(state.projects).toHaveLength(1)
      expect(state.projects[0].id).toBe('p2')
    })

    it('switches to first remaining when current is removed', () => {
      const pre = { ...initial, projects: [makeProject('p1', 'A'), makeProject('p2', 'B')], currentProjectId: 'p1' }
      const state = saveReducer(pre, removeProject('p1'))
      expect(state.currentProjectId).toBe('p2')
    })

    it('sets currentProjectId to null when last project removed', () => {
      const pre = { ...initial, projects: [makeProject('p1', 'Only')], currentProjectId: 'p1' }
      const state = saveReducer(pre, removeProject('p1'))
      expect(state.currentProjectId).toBeNull()
    })

    it('does nothing if project id not found', () => {
      const projects = [makeProject('p1', 'A')]
      const pre = { ...initial, projects, currentProjectId: 'p1' }
      const state = saveReducer(pre, removeProject('p2'))
      expect(state.projects).toEqual(projects)
      expect(state.currentProjectId).toBe('p1')
    })
  })

  describe('switchProject', () => {
    it('sets currentProjectId', () => {
      const state = saveReducer(initial, switchProject('p42'))
      expect(state.currentProjectId).toBe('p42')
    })
  })

  describe('addSaveEntry', () => {
    it('prepends a save entry to the specified project', () => {
      const project = makeProject('p1', 'Project', [makeSave('s1', 'First')])
      const pre = { ...initial, projects: [project] }
      const save = makeSave('s2', 'Second')
      const state = saveReducer(pre, addSaveEntry({ projectId: 'p1', save }))
      expect(state.projects[0].saves).toHaveLength(2)
      expect(state.projects[0].saves[0].id).toBe('s2')
      expect(state.projects[0].saves[1].id).toBe('s1')
    })

    it('does nothing if project not found', () => {
      const pre = { ...initial, projects: [makeProject('p1', 'P')] }
      const state = saveReducer(pre, addSaveEntry({ projectId: 'p2', save: makeSave('s1', 'S') }))
      expect(state.projects[0].saves).toHaveLength(0)
    })
  })

  describe('removeSaveEntry', () => {
    it('removes a save entry from all projects', () => {
      const pre = {
        ...initial,
        projects: [
          makeProject('p1', 'A', [makeSave('s1', 'S1'), makeSave('s2', 'S2')]),
          makeProject('p2', 'B', [makeSave('s1', 'S1')]),
        ],
      }
      const state = saveReducer(pre, removeSaveEntry('s1'))
      expect(state.projects[0].saves).toHaveLength(1)
      expect(state.projects[0].saves[0].id).toBe('s2')
      expect(state.projects[1].saves).toHaveLength(0)
    })

    it('does nothing if save id not found in any project', () => {
      const project = makeProject('p1', 'P', [makeSave('s1', 'S1')])
      const pre = { ...initial, projects: [project] }
      const state = saveReducer(pre, removeSaveEntry('s2'))
      expect(state.projects[0].saves).toHaveLength(1)
    })
  })

  describe('setHistoryVisible', () => {
    it('sets historyVisible to true', () => {
      const state = saveReducer(initial, setHistoryVisible(true))
      expect(state.historyVisible).toBe(true)
    })

    it('sets historyVisible to false', () => {
      const pre = { ...initial, historyVisible: true }
      const state = saveReducer(pre, setHistoryVisible(false))
      expect(state.historyVisible).toBe(false)
    })
  })

  describe('toggleHistory', () => {
    it('toggles historyVisible from false to true', () => {
      const state = saveReducer(initial, toggleHistory())
      expect(state.historyVisible).toBe(true)
    })

    it('toggles historyVisible from true to false', () => {
      const pre = { ...initial, historyVisible: true }
      const state = saveReducer(pre, toggleHistory())
      expect(state.historyVisible).toBe(false)
    })
  })

  describe('setLoaded', () => {
    it('sets loaded to true', () => {
      const state = saveReducer(initial, setLoaded(true))
      expect(state.loaded).toBe(true)
    })

    it('sets loaded to false', () => {
      const pre = { ...initial, loaded: true }
      const state = saveReducer(pre, setLoaded(false))
      expect(state.loaded).toBe(false)
    })
  })
})
