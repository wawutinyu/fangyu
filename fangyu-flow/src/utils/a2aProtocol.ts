/** A2A v1.0 数据模型 — 完全体协议 (Google Agent2Agent) */

export enum TaskState {
  SUBMITTED = 'submitted',
  WORKING = 'working',
  INPUT_REQUIRED = 'input-required',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
  REJECTED = 'rejected',
}

export interface TaskStatus {
  state: TaskState
  message?: string
  updatedAt?: string
}

export interface Task {
  id: string
  status: TaskStatus
  history?: Message[]
  artifact?: Artifact
  metadata?: Record<string, unknown>
}

export enum Role {
  USER = 'user',
  AGENT = 'agent',
}

export interface Message {
  role: Role
  parts: Part[]
  metadata?: Record<string, unknown>
}

export interface TextPart { type: 'text'; text: string }
export interface FilePart { type: 'file'; file: { mimeType?: string; name?: string; bytes?: string; uri?: string } }
export interface DataPart { type: 'data'; data: Record<string, unknown> }
export type Part = TextPart | FilePart | DataPart

export interface Artifact {
  parts: Part[]
  index?: number
  append?: boolean
  metadata?: Record<string, unknown>
}

export interface TaskStatusUpdateEvent { type: 'status'; id: string; status: TaskStatus; final?: boolean }
export interface TaskArtifactUpdateEvent { type: 'artifact'; id: string; artifact: Artifact; final?: boolean }
export type TaskUpdateEvent = TaskStatusUpdateEvent | TaskArtifactUpdateEvent

export interface AgentProvider { organization?: string; url?: string }
export interface AgentCapabilities { streaming?: boolean; pushNotifications?: boolean; stateTransitionHistory?: boolean }
export interface AgentSkill {
  id: string; name: string; description?: string; tags?: string[]; examples?: string[]
  inputMimeTypes?: string[]; outputMimeTypes?: string[]
  inputSchema?: Record<string, unknown>; outputSchema?: Record<string, unknown>
}
export interface AgentInterface { type: 'in-memory' | 'http' | 'grpc' | string; port?: number; path?: string; tenant?: string }
export interface AgentCardSignature { algorithm: string; value: string; publicKey?: string }

export interface AgentCard {
  name: string; description?: string; url?: string; provider?: AgentProvider
  version: string; documentationUrl?: string; capabilities: AgentCapabilities
  skills: AgentSkill[]; defaultInterface: AgentInterface
  supportedInterfaces?: AgentInterface[]; authSchemes?: SecurityScheme[]
  signature?: AgentCardSignature; metadata?: Record<string, unknown>
}

export type SecurityScheme =
  | { type: 'apiKey'; scheme: APIKeySecurityScheme }
  | { type: 'http'; scheme: HTTPAuthSecurityScheme }
  | { type: 'oauth2'; scheme: OAuth2SecurityScheme }
  | { type: 'openIdConnect'; scheme: OpenIdConnectSecurityScheme }
  | { type: 'mutualTls'; scheme: MutualTlsSecurityScheme }

export interface APIKeySecurityScheme { name: string; in: 'header' | 'query' | 'cookie' }
export interface HTTPAuthSecurityScheme { scheme: 'basic' | 'bearer' | string }
export interface OAuth2SecurityScheme { flows: OAuthFlows }
export interface OpenIdConnectSecurityScheme { openIdConnectUrl: string }
export interface MutualTlsSecurityScheme {}
export interface OAuthFlows {
  authorizationCode?: AuthorizationCodeOAuthFlow
  clientCredentials?: ClientCredentialsOAuthFlow
  deviceCode?: DeviceCodeOAuthFlow
}
export interface AuthorizationCodeOAuthFlow { authorizationUrl: string; tokenUrl: string; scopes: string[] }
export interface ClientCredentialsOAuthFlow { tokenUrl: string; scopes: string[] }
export interface DeviceCodeOAuthFlow { deviceAuthorizationUrl: string; tokenUrl: string; scopes: string[] }

export interface TrustConfig {
  enabled: boolean; algorithm: 'Ed25519' | 'ECDSA-P256'
  anchorSource: 'auto' | 'import'; anchorKeyPath?: string
  policies: TrustPolicy[]; revocationList: string[]
  auditEnabled: boolean; auditPath: string
}

export interface TrustPolicy { agentId: string; allowedSkills: string[] }

export type AgentNodeType = 'a2a-agent' | 'a2a-router' | 'a2a-group'

export interface AgentNodeData {
  agentCard: AgentCard
  trustConfig: TrustConfig
  timeout: number; retryCount: number
  lifecycle: 'sync' | 'async' | 'streaming'
  pushNotificationUrl: string; tenantId: string
  extensions: Record<string, string>
}

export interface RouterNodeData {
  label: string
  routingRules: RoutingRule[]
  defaultTarget?: string
  position: { x: number; y: number }
}

export interface RoutingRule {
  id: string
  sourceSkill: string
  targetAgentId: string
  condition?: string
  priority: number
}
