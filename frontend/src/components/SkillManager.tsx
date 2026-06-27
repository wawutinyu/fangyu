import { useState, useEffect, useCallback } from 'react'

interface SkillEntry {
  name: string
  description: string
  version: string
  created: number
}

export default function SkillManager() {
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/v1/skills/')
      const json = await resp.json()
      setSkills(json.skills || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  const handleRemove = useCallback(async (name: string) => {
    try {
      await fetch(`/api/v1/skills/${encodeURIComponent(name)}`, { method: 'DELETE' })
      fetchSkills()
    } catch { /* ignore */ }
  }, [fetchSkills])

  return (
    <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid var(--border-light)' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          <span>技能库 ({skills.length})</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {expanded && (
        <div style={{ maxHeight: 200, overflowY: 'auto', padding: '8px 14px' }}>
          {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>加载中...</div>}
          {!loading && skills.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
              暂无技能。使用「技能学习」节点从 LLM 输出自动学习。
            </div>
          )}
          {skills.map(skill => (
            <div key={skill.name} style={{ marginBottom: 8, padding: 8, borderRadius: 6, border: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{skill.name}</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--border-light)', padding: '0 4px', borderRadius: 3 }}>v{skill.version}</span>
                  <button style={{ fontSize: 10, color: '#ff4d4f', border: '1px solid #ffccc7', borderRadius: 4, padding: '1px 6px', background: '#fff2f0', cursor: 'pointer' }}
                    onClick={() => handleRemove(skill.name)}
                  >删除</button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{skill.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
