import type { Node } from 'reactflow'
import type { ViolationDetail, ViolationPayload } from '../components/ViolationPanel'

export interface ConstitutionScanResult {
  deny: ViolationDetail[]
  warn: ViolationDetail[]
  all: ViolationDetail[]
  blocked: boolean
}

function mapInnerNodeForScan(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return { id: '', data: { originType: '', config: {}, label: '' } }
  const obj = raw as Record<string, unknown>
  if (obj.data && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>
    return {
      id: obj.id,
      data: {
        originType: data.originType || data.type || obj.type,
        label: data.label || data.name || obj.name || '',
        config: data.config || {},
        inner_nodes: ((data.inner_nodes as unknown[]) || []).map(mapInnerNodeForScan),
      },
    }
  }
  return {
    id: obj.id,
    data: {
      originType: obj.type || obj.originType,
      label: obj.name || obj.label || '',
      config: obj.config || {},
      inner_nodes: ((obj.inner_nodes as unknown[]) || []).map(mapInnerNodeForScan),
    },
  }
}

export function canvasNodesToScanPayload(nodes: Node[]): Record<string, unknown>[] {
  return nodes.map(n => {
    const data = n.data || {}
    return {
      id: n.id,
      data: {
        originType: (data.originType as string) || n.type,
        label: (data.label as string) || (data.name as string) || '',
        config: (data.config as Record<string, unknown>) || {},
        inner_nodes: ((data.inner_nodes as unknown[]) || []).map(mapInnerNodeForScan),
      },
    }
  })
}

export async function scanFlowConstitution(nodes: Node[], context = 'flow'): Promise<ConstitutionScanResult> {
  const resp = await fetch('/api/v1/constitution/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes: canvasNodesToScanPayload(nodes), context }),
  })
  if (!resp.ok) {
    throw new Error(`宪法扫描失败 (${resp.status})`)
  }
  return resp.json()
}

export function violationsToPayload(violations: ViolationDetail[], severity: 'warn' | 'deny'): ViolationPayload {
  if (violations.length === 0) {
    return { type: 'constitution', severity, message: '' }
  }
  const first = violations[0]
  return {
    type: 'constitution',
    severity,
    rule: first.rule,
    message: violations.length === 1
      ? first.message
      : `发现 ${violations.length} 条宪法${severity === 'warn' ? '警告' : '违规'}`,
    violations,
  }
}

export function warningsToViolationPayload(warnings: ViolationDetail[]): ViolationPayload {
  return violationsToPayload(warnings, 'warn')
}

export function denyToViolationPayload(denials: ViolationDetail[]): ViolationPayload {
  return violationsToPayload(denials, 'deny')
}

export function normalizeFlowResult(raw: Record<string, unknown>): {
  violation?: ViolationPayload
  constitution_warnings?: ViolationDetail[]
} {
  const out: { violation?: ViolationPayload; constitution_warnings?: ViolationDetail[] } = {}

  if (Array.isArray(raw.constitution_warnings)) {
    out.constitution_warnings = raw.constitution_warnings as ViolationDetail[]
  }

  if (raw.violation && typeof raw.violation === 'object') {
    const v = raw.violation as ViolationPayload
    out.violation = {
      type: v.type || 'constitution',
      severity: v.severity || 'deny',
      rule: v.rule,
      message: v.message || (raw.error as string) || '违反宪法约束',
      violations: v.violations || (raw.violations as ViolationDetail[]) || [],
    }
  } else if (raw.constitution_violation) {
    const violations = (raw.violations as ViolationDetail[]) || []
    out.violation = denyToViolationPayload(violations.length ? violations : [{
      rule: (raw.rule as string) || 'constitution',
      message: (raw.error as string) || '违反宪法约束',
      severity: 'deny',
    }])
  }

  return out
}
