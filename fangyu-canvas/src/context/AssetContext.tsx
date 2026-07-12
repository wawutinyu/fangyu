import { createContext, useContext } from 'react'

export interface AgentBindTarget {
  nodeId: string
  skillId: string
  onBound?: () => void
}

export interface AssetContextValue {
  loadFlowToCanvas: (data: unknown) => void
  loadAgentsToCanvas: (data: { nodes: unknown[]; edges: unknown[] }) => void
  agentBindTarget: AgentBindTarget | null
  setAgentBindTarget: (target: AgentBindTarget | null) => void
  bindAgentSkillFlow: (flow: { nodes: unknown[]; edges: unknown[] }) => void
}

export const AssetContext = createContext<AssetContextValue>({
  loadFlowToCanvas: () => {},
  loadAgentsToCanvas: () => {},
  agentBindTarget: null,
  setAgentBindTarget: () => {},
  bindAgentSkillFlow: () => {},
})

export function useAssetContext() {
  return useContext(AssetContext)
}
