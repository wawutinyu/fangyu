import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'fangyu-projects'

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { projects: [], currentProjectId: null }
  } catch { return { projects: [], currentProjectId: null } }
}

function persist(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export const useSaveStore = defineStore('saves', () => {
  const saved = ref(loadAll())
  const historyVisible = ref(false)

  const projects = computed(() => saved.value.projects)
  const currentProjectId = computed({
    get: () => saved.value.currentProjectId,
    set: (id) => { saved.value.currentProjectId = id; persist(saved.value) },
  })

  const currentProject = computed(() =>
    saved.value.projects.find(p => p.id === saved.value.currentProjectId)
  )

  function ensureCurrentProject() {
    if (!saved.value.currentProjectId || !saved.value.projects.find(p => p.id === saved.value.currentProjectId)) {
      if (saved.value.projects.length === 0) {
        createProject('默认项目')
      } else {
        saved.value.currentProjectId = saved.value.projects[0].id
      }
      persist(saved.value)
    }
  }

  function createProject(name) {
    const p = { id: genId(), name, time: Date.now(), saves: [] }
    saved.value.projects.push(p)
    saved.value.currentProjectId = p.id
    persist(saved.value)
    return p
  }

  function renameProject(id, name) {
    const p = saved.value.projects.find(p => p.id === id)
    if (p) { p.name = name; p.time = Date.now(); persist(saved.value) }
  }

  function deleteProject(id) {
    saved.value.projects = saved.value.projects.filter(p => p.id !== id)
    if (saved.value.currentProjectId === id) {
      saved.value.currentProjectId = saved.value.projects[0]?.id || null
    }
    persist(saved.value)
  }

  function switchProject(id) {
    saved.value.currentProjectId = id
    persist(saved.value)
  }

  function addSave(name, flowData) {
    ensureCurrentProject()
    const p = saved.value.projects.find(p => p.id === saved.value.currentProjectId)
    if (!p) return null
    const entry = { id: genId(), name, time: Date.now(), data: flowData }
    p.saves.unshift(entry)
    p.time = Date.now()
    persist(saved.value)
    return entry
  }

  function deleteSave(saveId) {
    for (const p of saved.value.projects) {
      const idx = p.saves.findIndex(s => s.id === saveId)
      if (idx !== -1) { p.saves.splice(idx, 1); persist(saved.value); return }
    }
  }

  function renameSave(saveId, name) {
    for (const p of saved.value.projects) {
      const s = p.saves.find(s => s.id === saveId)
      if (s) { s.name = name; persist(saved.value); return }
    }
  }

  function getAllSavesFlat() {
    const all = []
    for (const p of saved.value.projects) {
      for (const s of p.saves) {
        all.push({ ...s, projectName: p.name, projectId: p.id })
      }
    }
    return all
  }

  function toggleHistory() {
    historyVisible.value = !historyVisible.value
    return historyVisible.value
  }

  return {
    saved, historyVisible, projects, currentProjectId, currentProject,
    ensureCurrentProject, createProject, renameProject, deleteProject, switchProject,
    addSave, deleteSave, renameSave, getAllSavesFlat, toggleHistory,
  }
})
