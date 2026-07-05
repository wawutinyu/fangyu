/** A2A + ATP 完整 Python 模块代码生成 */

export interface A2AModuleFile { filename: string; content: string }

// ======== a2a/__init__.py ========
const A2A_INIT = `"""A2A Protocol — Agent-to-Agent 通讯层"""
from .protocol import (
    Task, TaskStatus, TaskState,
    Message, Role, Part, TextPart, FilePart, DataPart, Artifact,
    AgentCard, AgentCapabilities, AgentSkill, AgentInterface,
)
from .registry import AgentRegistry
from .bus import AgentBus
`

// ======== a2a/protocol.py ========
const A2A_PROTOCOL = `"""A2A v1.0 数据模型 — 完全体 (Google Agent2Agent)"""
import json, uuid
from dataclasses import dataclass, field
from typing import Optional


class TaskState:
    SUBMITTED = "submitted"
    WORKING = "working"
    INPUT_REQUIRED = "input-required"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"
    REJECTED = "rejected"

    def __init__(self, state: str, message: str = ""):
        self.state = state
        self.message = message

    def is_terminal(self) -> bool:
        return self.state in (self.COMPLETED, self.FAILED, self.CANCELED, self.REJECTED)

    def to_dict(self):
        d = {"state": self.state}
        if self.message: d["message"] = self.message
        return d


@dataclass
class TaskStatus:
    state: TaskState
    updated_at: str = ""

    def to_dict(self):
        return {"state": self.state.state, "message": self.state.message, "updatedAt": self.updated_at}


@dataclass
class Part:
    type: str = "text"
    text: str = ""
    data: dict = field(default_factory=dict)
    file: dict = field(default_factory=dict)

    @staticmethod
    def text(content: str) -> "Part":
        return Part(type="text", text=content)

    @staticmethod
    def data(obj: dict) -> "Part":
        return Part(type="data", data=obj)

    def to_dict(self):
        if self.type == "text": return {"type": "text", "text": self.text}
        if self.type == "data": return {"type": "data", "data": self.data}
        return {"type": "file", "file": self.file}


@dataclass
class Message:
    role: str = "user"
    parts: list = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    def to_dict(self):
        return {"role": self.role, "parts": [p.to_dict() if isinstance(p, Part) else p for p in self.parts], "metadata": self.metadata}


@dataclass
class Artifact:
    parts: list = field(default_factory=list)
    index: int = 0
    append: bool = False
    metadata: dict = field(default_factory=dict)

    def to_dict(self):
        return {"parts": [p.to_dict() if isinstance(p, Part) else p for p in self.parts], "index": self.index, "append": self.append}


@dataclass
class Task:
    id: str = ""
    status: Optional[TaskStatus] = None
    history: list = field(default_factory=list)
    artifact: Optional[Artifact] = None
    metadata: dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.id: self.id = uuid.uuid4().hex[:12]
        if not self.status: self.status = TaskStatus(TaskState(TaskState.SUBMITTED))

    def to_dict(self):
        d = {"id": self.id, "status": self.status.to_dict()}
        if self.history: d["history"] = [m.to_dict() if isinstance(m, Message) else m for m in self.history]
        if self.artifact: d["artifact"] = self.artifact.to_dict()
        if self.metadata: d["metadata"] = self.metadata
        return d


# Agent Card

@dataclass
class AgentCapabilities:
    streaming: bool = False
    pushNotifications: bool = False
    stateTransitionHistory: bool = False

    def to_dict(self):
        return {"streaming": self.streaming, "pushNotifications": self.pushNotifications}


@dataclass
class AgentInterface:
    type: str = "in-memory"
    port: Optional[int] = None
    path: Optional[str] = None

    def to_dict(self):
        d = {"type": self.type}
        if self.port: d["port"] = self.port
        if self.path: d["path"] = self.path
        return d


@dataclass
class AgentSkill:
    id: str = ""
    name: str = ""
    description: str = ""
    tags: list = field(default_factory=list)
    inputMimeTypes: list = field(default_factory=list)
    outputMimeTypes: list = field(default_factory=list)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description,
                "tags": self.tags, "inputMimeTypes": self.inputMimeTypes, "outputMimeTypes": self.outputMimeTypes}


@dataclass
class AgentCard:
    name: str = ""
    description: str = ""
    version: str = "1.0.0"
    capabilities: AgentCapabilities = field(default_factory=AgentCapabilities)
    skills: list = field(default_factory=list)
    defaultInterface: AgentInterface = field(default_factory=AgentInterface)
    metadata: dict = field(default_factory=dict)

    def to_dict(self):
        return {"name": self.name, "description": self.description, "version": self.version,
                "capabilities": self.capabilities.to_dict(),
                "skills": [s.to_dict() if isinstance(s, AgentSkill) else s for s in self.skills],
                "defaultInterface": self.defaultInterface.to_dict()}
`

// ======== a2a/registry.py ========
const A2A_REGISTRY = `"""Agent Registry — AgentCard 注册与发现"""
from typing import Optional
from a2a.protocol import AgentCard


class AgentRegistry:
    _agents: dict[str, AgentCard] = {}
    _factories: dict[str, callable] = {}

    @classmethod
    def register(cls, name: str, factory: callable = None):
        cls._factories[name] = factory

    @classmethod
    def list_agents(cls) -> list[str]:
        return list(cls._factories.keys())

    @classmethod
    def create_agent(cls, name: str):
        factory = cls._factories.get(name)
        return factory() if factory else None
`

// ======== a2a/bus.py ========
const A2A_BUS = `"""AgentBus — In-Memory JSON-RPC 消息总线"""
import json, uuid, time, threading
from typing import Optional
from a2a.protocol import Task, TaskStatus, TaskState, Message, Artifact
from a2a.registry import AgentRegistry


class AgentBus:
    def __init__(self, enable_trust: bool = True):
        self._tasks: dict[str, Task] = {}
        self._subscribers: dict[str, list[callable]] = {}
        self._lock = threading.Lock()
        self._enable_trust = enable_trust

    def send_message(self, target_agent: str, message: Message, task_id: str = "", **metadata) -> Task:
        task = Task(id=task_id or uuid.uuid4().hex[:12])
        task.history.append(message)
        if metadata: task.metadata.update(metadata)
        agent = AgentRegistry.create_agent(target_agent)
        if agent is None:
            task.status = TaskStatus(TaskState(TaskState.FAILED, f"agent '{target_agent}' not found"))
            self._tasks[task.id] = task
            return task
        with self._lock: self._tasks[task.id] = task
        try:
            result = agent.handle_task(task)
            self._tasks[task.id] = result
        except Exception as e:
            task.status = TaskStatus(TaskState(TaskState.FAILED, str(e)))
            self._tasks[task.id] = task
        self._notify(target_agent, task)
        return self._tasks[task.id]

    def get_task(self, task_id: str) -> Optional[Task]:
        return self._tasks.get(task_id)

    def list_tasks(self, agent_name: str = "") -> list[Task]:
        with self._lock:
            if agent_name: return [t for t in self._tasks.values() if t.metadata.get("target_agent") == agent_name]
            return list(self._tasks.values())

    def cancel_task(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task and not task.status.state.is_terminal():
                task.status = TaskStatus(TaskState(TaskState.CANCELED, "canceled"))
                return True
            return False

    def subscribe(self, agent_name: str, callback: callable):
        with self._lock:
            self._subscribers.setdefault(agent_name, []).append(callback)

    def _notify(self, agent_name: str, task: Task):
        for cb in list(self._subscribers.get(agent_name, [])):
            try: cb(agent_name, task)
            except Exception: pass
`

// ======== a2a/transport_http.py (full implementation) ========
const A2A_HTTP = `"""A2A HTTP Transport — 基于 JSON-RPC 2.0 的 HTTP 传输层。"""
import json, threading, time
from typing import Optional
import urllib.request, urllib.error


class JSONRPCError(Exception):
    def __init__(self, code: int, message: str, data: object = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(f"[{code}] {message}")


class HTTPTransport:
    def __init__(self, base_url: str = "", api_key: str = "", timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def call(self, method: str, params: dict = None, request_id: str = None) -> dict:
        import uuid
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": request_id or uuid.uuid4().hex[:12],
        }
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.base_url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                result = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise JSONRPCError(e.code, f"HTTP {e.code}: {body[:200]}")
        except urllib.error.URLError as e:
            raise JSONRPCError(-1, f"Connection failed: {e.reason}")
        if "error" in result:
            err = result["error"]
            raise JSONRPCError(err.get("code", -1), err.get("message", "unknown error"), err.get("data"))
        return result.get("result", {})

    def send_message(self, target_url: str, message: dict, task_id: str = "") -> dict:
        return self.call("a2a.send_message", {"message": message, "taskId": task_id})

    def get_task(self, target_url: str, task_id: str) -> dict:
        return self.call("a2a.get_task", {"taskId": task_id})

    def list_tasks(self, target_url: str, agent_name: str = "") -> dict:
        return self.call("a2a.list_tasks", {"agentName": agent_name})

    def subscribe(self, target_url: str, callback_url: str, agent_name: str = "") -> dict:
        return self.call("a2a.subscribe", {"callbackUrl": callback_url, "agentName": agent_name})
`

// ======== a2a/trust/__init__.py ========
const TRUST_INIT = `"""Agent Trust Protocol (ATP)"""
from .identity import AgentIdentity
from .envelope import MessageEnvelope
from .registry import TrustRegistry
from .anchor import TrustAnchor
`

// ======== a2a/trust/anchor.py ========
const TRUST_ANCHOR = `"""TrustAnchor — 平台根密钥"""
import json
from a2a.trust.identity import AgentIdentity


class TrustAnchor:
    _instance = None

    def __init__(self):
        self._identity = AgentIdentity.generate()
        self._public_key = self._identity.public_key

    @classmethod
    def get_instance(cls) -> "TrustAnchor":
        if cls._instance is None: cls._instance = cls()
        return cls._instance

    @property
    def public_key(self) -> str: return self._public_key

    def sign_identity_cert(self, agent_id: str, public_key: str) -> str:
        from a2a.trust.registry import TrustRegistry
        payload = json.dumps({"agent_id": agent_id, "public_key": public_key}, sort_keys=True)
        return self._identity.sign(payload)
`

// ======== a2a/trust/identity.py ========
const TRUST_IDENTITY = `"""AgentIdentity — Ed25519 身份 (cryptography)"""
import uuid
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, PublicFormat, NoEncryption


class AgentIdentity:
    def __init__(self, private_key: Ed25519PrivateKey):
        self._private_key = private_key
        self._public_key = private_key.public_key()

    @classmethod
    def generate(cls) -> "AgentIdentity":
        return cls(Ed25519PrivateKey.generate())

    @classmethod
    def from_private_bytes(cls, raw: bytes) -> "AgentIdentity":
        return cls(Ed25519PrivateKey.from_private_bytes(raw))

    @property
    def public_key(self) -> str:
        return self._public_key.public_bytes(Encoding.Raw, PublicFormat.Raw).hex()

    @property
    def private_key_bytes(self) -> bytes:
        return self._private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())

    def sign(self, payload: str) -> str:
        return self._private_key.sign(payload.encode()).hex()

    @staticmethod
    def verify(public_key_hex: str, payload: str, signature_hex: str) -> bool:
        try:
            pub_bytes = bytes.fromhex(public_key_hex)
            sig_bytes = bytes.fromhex(signature_hex)
            pub_key = Ed25519PublicKey.from_public_bytes(pub_bytes)
            pub_key.verify(sig_bytes, payload.encode())
            return True
        except Exception:
            return False

    def to_dict(self) -> dict:
        return {"publicKey": self.public_key, "algorithm": "Ed25519"}
`

// ======== a2a/trust/envelope.py ========
const TRUST_ENVELOPE = `"""MessageEnvelope — 签名信封"""
import json, uuid, time
from a2a.trust.identity import AgentIdentity
from a2a.trust.registry import TrustRegistry


class MessageEnvelope:
    def __init__(self, payload: str, sender_id: str, timestamp: int, nonce: str, signature: str):
        self.payload = payload
        self.sender_id = sender_id
        self.timestamp = timestamp
        self.nonce = nonce
        self.signature = signature

    @staticmethod
    def sign(payload: str, sender_id: str, identity: AgentIdentity = None) -> "MessageEnvelope":
        from a2a.trust.anchor import TrustAnchor
        if identity is None: identity = TrustAnchor.get_instance()._identity
        nonce = uuid.uuid4().hex
        ts = int(time.time() * 1000)
        to_sign = json.dumps({"payload": payload, "sender_id": sender_id, "timestamp": ts, "nonce": nonce}, sort_keys=True)
        sig = identity.sign(to_sign)
        return MessageEnvelope(payload, sender_id, ts, nonce, sig)

    @staticmethod
    def verify(envelope: "MessageEnvelope") -> bool:
        if not TrustRegistry.check_nonce(envelope.nonce): return False
        if abs(int(time.time() * 1000) - envelope.timestamp) > 300_000: return False
        pubkey = TrustRegistry.get_public_key(envelope.sender_id)
        if not pubkey: return False
        to_verify = json.dumps({"payload": envelope.payload, "sender_id": envelope.sender_id,
                                "timestamp": envelope.timestamp, "nonce": envelope.nonce}, sort_keys=True)
        return AgentIdentity.verify(pubkey, to_verify, envelope.signature)

    def to_dict(self) -> dict:
        return {"payload": self.payload, "senderId": self.sender_id,
                "timestamp": self.timestamp, "nonce": self.nonce, "signature": self.signature}
`

// ======== a2a/trust/registry.py ========
const TRUST_REGISTRY = `"""TrustRegistry — 身份注册 + 授权 + 吊销 + 防重放"""
from typing import Optional


class TrustRegistry:
    _identities: dict[str, str] = {}
    _policies: dict[str, list[str]] = {}
    _revoked: set[str] = set()
    _nonces: set[str] = set()

    @classmethod
    def register(cls, agent_id: str, public_key: str, allowed_skills: list[str] = None):
        cls._identities[agent_id] = public_key
        cls._policies[agent_id] = allowed_skills or ["*"]

    @classmethod
    def get_public_key(cls, agent_id: str) -> Optional[str]:
        return None if agent_id in cls._revoked else cls._identities.get(agent_id)

    @classmethod
    def revoke(cls, agent_id: str): cls._revoked.add(agent_id)

    @classmethod
    def check_nonce(cls, nonce: str) -> bool:
        if nonce in cls._nonces: return False
        cls._nonces.add(nonce)
        if len(cls._nonces) > 10000: cls._nonces.clear()
        return True

    @classmethod
    def authorize(cls, agent_id: str, skill_id: str) -> bool:
        if agent_id in cls._revoked: return False
        allowed = cls._policies.get(agent_id, [])
        return "*" in allowed or skill_id in allowed
`

// ======== Main entry ========
function generateMainPy(a2aEnabled: boolean): string {
  if (!a2aEnabled) {
    return `"""AI Flow Canvas 入口"""
import sys
from flow_export import run_flow

def main():
    print("AI Flow Canvas — 流程执行器")
    print("提示: 使用 --enable-a2a 启用 A2A 通讯")
    run_flow()

if __name__ == "__main__":
    main()
`
  }
  return `"""AI Flow Canvas 入口 (A2A 模式)"""
import sys
from flow_export import run_flow

A2A_ENABLED = "--disable-a2a" not in sys.argv

def main():
    if A2A_ENABLED:
        print("[A2A] 智能体间通讯已启用")
        _init_a2a()
    print("AI Flow Canvas — 流程执行器")
    run_flow()

def _init_a2a():
    from a2a import register_all
    from a2a.trust.anchor import TrustAnchor
    from a2a.trust.registry import TrustRegistry
    from a2a.trust.identity import AgentIdentity
    from a2a.registry import AgentRegistry

    anchor = TrustAnchor.get_instance()
    register_all()
    for name in AgentRegistry.list_agents():
        agent_id = AgentIdentity.generate()
        TrustRegistry.register(name, agent_id.public_key, ["*"])
        print(f"  [A2A] Agent '{name}' registered")

if __name__ == "__main__":
    main()
`
}

/** 生成完整 a2a/ 模块树 */
export function generateA2AModules(_a2aEnabled: boolean): A2AModuleFile[] {
  return [
    { filename: 'a2a/__init__.py', content: A2A_INIT },
    { filename: 'a2a/protocol.py', content: A2A_PROTOCOL },
    { filename: 'a2a/registry.py', content: A2A_REGISTRY },
    { filename: 'a2a/bus.py', content: A2A_BUS },
    { filename: 'a2a/transport_http.py', content: A2A_HTTP },
    { filename: 'a2a/trust/__init__.py', content: TRUST_INIT },
    { filename: 'a2a/trust/anchor.py', content: TRUST_ANCHOR },
    { filename: 'a2a/trust/identity.py', content: TRUST_IDENTITY },
    { filename: 'a2a/trust/envelope.py', content: TRUST_ENVELOPE },
    { filename: 'a2a/trust/registry.py', content: TRUST_REGISTRY },
  ]
}

// ======== a2a/agents/router_agent.py (路由分发器) ========
function generateRouterAgentFile(routers: { id: string; label: string; rules: { sourceSkill: string; targetAgentId: string; condition?: string; priority: number }[]; defaultTarget?: string }[]): A2AModuleFile[] {
  const files: A2AModuleFile[] = []
  for (const router of routers) {
    const snake = router.label.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || `router_${router.id}`
    const rulesCode = router.rules.map(r =>
      `        RoutingRule(skill="${r.sourceSkill}", target="${r.targetAgentId}", condition=${JSON.stringify(r.condition || '')}, priority=${r.priority})`
    ).join(',\n')
    const content = `"""A2A Router — ${router.label}"""
from a2a.protocol import Task, TaskStatus, TaskState


class RoutingRule:
    def __init__(self, skill: str, target: str, condition: str = "", priority: int = 0):
        self.skill = skill
        self.target = target
        self.condition = condition
        self.priority = priority


class Router_${snake}:
    def __init__(self):
        self.rules = [
${rulesCode}
        ]
        self.default_target = ${JSON.stringify(router.defaultTarget || '')}

    def route(self, task: Task) -> str:
        if not task.history:
            return self.default_target
        last_msg = task.history[-1]
        skill_id = (last_msg.metadata or {}).get("skill_id", "")
        for rule in sorted(self.rules, key=lambda r: -r.priority):
            if rule.skill == skill_id or not rule.skill:
                if not rule.condition or rule.condition in str(task.to_dict()):
                    return rule.target
        return self.default_target

    def handle_task(self, task: Task) -> Task:
        target = self.route(task)
        if not target:
            task.status = TaskStatus(TaskState(TaskState.FAILED, "no route matched"))
            return task
        task.metadata["route_target"] = target
        task.status = TaskStatus(TaskState(TaskState.COMPLETED, f"routed to {target}"))
        return task


def create_router() -> Router_${snake}:
    return Router_${snake}()
`
    files.push({ filename: `a2a/agents/router_${snake}.py`, content })
  }
  return files
}

export { generateMainPy, generateRouterAgentFile }
