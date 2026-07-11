/** Agent Trust Protocol (ATP) — 端到端可信通讯 */

export type SignAlgorithm = 'Ed25519' | 'ECDSA-P256'

export interface AgentIdentity {
  agentId: string; publicKey: string; algorithm: SignAlgorithm
}

export interface MessageEnvelope {
  payload: string      // JSON-serialized A2A Message
  senderId: string
  timestamp: number    // Unix ms
  nonce: string        // UUID, for replay protection
  signature: string    // hex-encoded signature
}

export interface TrustAnchorConfig {
  source: 'auto' | 'import'
  publicKey?: string; keyPath?: string
}

export interface TrustRegistryEntry {
  agentId: string; publicKey: string; algorithm: SignAlgorithm
  issuedAt: number; revoked: boolean; revokedAt?: number
}

export interface AuthzPolicy {
  agentId: string; allowedSkills: string[]
  allowedTargets?: string[]; maxTasksPerMin?: number
}

export interface AgentTrustConfig {
  enabled: boolean; algorithm: SignAlgorithm
  anchor: TrustAnchorConfig; policies: AuthzPolicy[]
  revocationList: string[]; auditEnabled: boolean; auditPath: string
}

export const DEFAULT_TRUST_CONFIG: AgentTrustConfig = {
  enabled: true, algorithm: 'Ed25519', anchor: { source: 'auto' },
  policies: [], revocationList: [], auditEnabled: true, auditPath: './audit.log',
}
