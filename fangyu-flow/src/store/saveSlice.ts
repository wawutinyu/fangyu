import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { AppDispatch } from './index'

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

function genId(prefix = 'p') {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rand}`
}

const initialState: SaveState = {
  projects: [],
  currentProjectId: null,
  historyVisible: false,
  loaded: false,
}

export const saveSlice = createSlice({
  name: 'saves',
  initialState,
  reducers: {
    setProjects(state, action: PayloadAction<Project[]>) {
      state.projects = action.payload
      if (action.payload.length > 0 && !state.currentProjectId) {
        state.currentProjectId = action.payload[0].id
      }
      state.loaded = true
    },
    addProject(state, action: PayloadAction<Project>) {
      state.projects.push(action.payload)
      state.currentProjectId = action.payload.id
    },
    removeProject(state, action: PayloadAction<string>) {
      state.projects = state.projects.filter(p => p.id !== action.payload)
      if (state.currentProjectId === action.payload) {
        state.currentProjectId = state.projects[0]?.id || null
      }
    },
    switchProject(state, action: PayloadAction<string>) {
      state.currentProjectId = action.payload
    },
    addSaveEntry(state, action: PayloadAction<{ projectId: string; save: SaveEntry }>) {
      const p = state.projects.find(p => p.id === action.payload.projectId)
      if (p) p.saves.unshift(action.payload.save)
    },
    removeSaveEntry(state, action: PayloadAction<string>) {
      for (const p of state.projects) {
        p.saves = p.saves.filter(s => s.id !== action.payload)
      }
    },
    setHistoryVisible(state, action: PayloadAction<boolean>) {
      state.historyVisible = action.payload
    },
    toggleHistory(state) {
      state.historyVisible = !state.historyVisible
    },
    setLoaded(state, action: PayloadAction<boolean>) {
      state.loaded = action.payload
    },
  },
})

export const {
  setProjects, addProject, removeProject, switchProject,
  addSaveEntry, removeSaveEntry, setHistoryVisible, toggleHistory, setLoaded,
} = saveSlice.actions
export default saveSlice.reducer

export async function fetchAllProjects(dispatch: AppDispatch) {
  try {
    const resp = await fetch('/api/v1/projects/')
    if (!resp.ok) { dispatch(setLoaded(true)); return }
    const json = await resp.json()
    const rawProjects = json.projects || []
    const pList: Project[] = await Promise.all(
      rawProjects.map(async (p: { id: string; name: string; description?: string }) => {
        try {
          const sr = await fetch(`/api/v1/projects/${p.id}/saves`)
          if (sr.ok) {
            const sj = await sr.json()
            const saves: SaveEntry[] = (sj.saves || []).map((s: { id: string; name: string; created_at: string; flow_data: string }) => ({
              id: s.id,
              name: s.name,
              time: new Date(s.created_at).getTime(),
              data: (() => { try { return JSON.parse(s.flow_data) } catch { return {} } })(),
            }))
            return { id: p.id, name: p.name, description: p.description || '', saves }
          }
        } catch { /* ignore */ }
        return { id: p.id, name: p.name, description: p.description || '', saves: [] }
      })
    )
    dispatch(setProjects(pList))
  } catch { dispatch(setLoaded(true)) }
}

export async function createProjectApi(name: string, dispatch: AppDispatch) {
  const id = genId('p')
  try {
    const resp = await fetch('/api/v1/projects/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    })
    if (resp.ok) {
      const p = await resp.json()
      dispatch(addProject({ ...p, saves: [] }))
      return
    }
  } catch { /* ignore */ }
  dispatch(addProject({ id, name, description: '', saves: [] }))
}

export async function saveFlowApi(projectId: string, name: string, flowData: Record<string, unknown>, dispatch: AppDispatch) {
  const id = genId('s')
  const entry: SaveEntry = { id, name, time: Date.now(), data: flowData }
  dispatch(addSaveEntry({ projectId, save: entry }))
  try {
    await fetch(`/api/v1/projects/${projectId}/saves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, flow_data: JSON.stringify(flowData) }),
    })
  } catch { /* ignore */ }
  return entry
}

export async function deleteSaveApi(saveId: string, dispatch: AppDispatch) {
  dispatch(removeSaveEntry(saveId))
  try {
    await fetch(`/api/v1/projects/saves/${saveId}`, { method: 'DELETE' })
  } catch { /* ignore */ }
}
