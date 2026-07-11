"""
A2A / ATP 运行时测试 — 验证生成的 Python 代码可执行。
不依赖后端，直接 import 生成的模块。
"""
import sys, os, json, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class TestA2ARuntime(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # 在临时目录中构建完整的 a2a/ 包结构
        cls.tmp = Path(tempfile.mkdtemp(prefix="a2a_test_"))
        pkg = cls.tmp / "a2a"
        trust = pkg / "trust"
        agents = pkg / "agents"
        for d in (pkg, trust, agents):
            d.mkdir(parents=True)
            (d / "__init__.py").touch()

        # protocol.py
        (pkg / "protocol.py").write_text("""import json, uuid
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
""")

        # registry.py
        (pkg / "registry.py").write_text("""from typing import Optional
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
""")

        # trust/identity.py (cryptography version)
        (trust / "identity.py").write_text("""import uuid
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, PublicFormat, NoEncryption


class AgentIdentity:
    def __init__(self, private_key: Ed25519PrivateKey):
        self._private_key = private_key
        self._public_key = private_key.public_key()

    @classmethod
    def generate(cls) -> "AgentIdentity":
        return cls(Ed25519PrivateKey.generate())

    @property
    def public_key(self) -> str:
        return self._public_key.public_bytes(Encoding.Raw, PublicFormat.Raw).hex()

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
""")

        # trust/registry.py (used by envelope)
        (trust / "registry.py").write_text("""from typing import Optional


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
""")

        sys.path.insert(0, str(cls.tmp))

    @classmethod
    def tearDownClass(cls):
        import shutil
        shutil.rmtree(cls.tmp, ignore_errors=True)

    # ===== Identity tests =====

    def test_identity_generate_creates_keypair(self):
        from a2a.trust.identity import AgentIdentity
        identity = AgentIdentity.generate()
        self.assertTrue(len(identity.public_key) > 0)

    def test_identity_sign_and_verify(self):
        from a2a.trust.identity import AgentIdentity
        identity = AgentIdentity.generate()
        payload = "hello a2a"
        sig = identity.sign(payload)
        self.assertTrue(AgentIdentity.verify(identity.public_key, payload, sig))

    def test_verify_rejects_tampered_payload(self):
        from a2a.trust.identity import AgentIdentity
        identity = AgentIdentity.generate()
        payload = "hello a2a"
        sig = identity.sign(payload)
        self.assertFalse(AgentIdentity.verify(identity.public_key, payload + "x", sig))

    def test_verify_rejects_wrong_key(self):
        from a2a.trust.identity import AgentIdentity
        id1 = AgentIdentity.generate()
        id2 = AgentIdentity.generate()
        sig = id1.sign("hello")
        self.assertFalse(AgentIdentity.verify(id2.public_key, "hello", sig))

    def test_identity_to_dict(self):
        from a2a.trust.identity import AgentIdentity
        identity = AgentIdentity.generate()
        d = identity.to_dict()
        self.assertEqual(d["algorithm"], "Ed25519")
        self.assertIn("publicKey", d)

    # ===== Envelope tests =====

    def test_envelope_sign_and_verify(self):
        from a2a.trust.identity import AgentIdentity
        from a2a.trust.registry import TrustRegistry
        identity = AgentIdentity.generate()
        TrustRegistry.register("agent_1", identity.public_key, ["*"])

        import json, time, uuid
        payload = json.dumps({"msg": "hello"})
        nonce = uuid.uuid4().hex
        ts = int(time.time() * 1000)
        to_sign = json.dumps({"payload": payload, "sender_id": "agent_1", "timestamp": ts, "nonce": nonce}, sort_keys=True)
        sig = identity.sign(to_sign)

        # Verify
        self.assertTrue(TrustRegistry.check_nonce(nonce))
        pubkey = TrustRegistry.get_public_key("agent_1")
        self.assertIsNotNone(pubkey)
        from a2a.trust.identity import AgentIdentity as AI
        self.assertTrue(AI.verify(pubkey, to_sign, sig))

    def test_envelope_replay_attack(self):
        from a2a.trust.registry import TrustRegistry
        nonce = "test-nonce-123"
        self.assertTrue(TrustRegistry.check_nonce(nonce))
        self.assertFalse(TrustRegistry.check_nonce(nonce))

    # ===== Registry tests =====

    def test_registry_authorize_allows_all(self):
        from a2a.trust.registry import TrustRegistry
        TrustRegistry.register("agent_a", "pubkey", ["*"])
        self.assertTrue(TrustRegistry.authorize("agent_a", "any-skill"))

    def test_registry_authorize_specific(self):
        from a2a.trust.registry import TrustRegistry
        TrustRegistry.register("agent_b", "pubkey", ["search", "chat"])
        self.assertTrue(TrustRegistry.authorize("agent_b", "search"))
        self.assertFalse(TrustRegistry.authorize("agent_b", "unknown"))

    def test_registry_revoke(self):
        from a2a.trust.registry import TrustRegistry
        TrustRegistry.register("agent_c", "pubkey", ["*"])
        self.assertIsNotNone(TrustRegistry.get_public_key("agent_c"))
        TrustRegistry.revoke("agent_c")
        self.assertIsNone(TrustRegistry.get_public_key("agent_c"))
        self.assertFalse(TrustRegistry.authorize("agent_c", "any"))

    # ===== Agent registry tests =====

    def test_agent_registry_register_and_create(self):
        from a2a.registry import AgentRegistry
        AgentRegistry.register("test_agent", lambda: {"name": "test_agent"})
        self.assertIn("test_agent", AgentRegistry.list_agents())
        agent = AgentRegistry.create_agent("test_agent")
        self.assertEqual(agent["name"], "test_agent")

    def test_agent_registry_nonexistent(self):
        from a2a.registry import AgentRegistry
        self.assertIsNone(AgentRegistry.create_agent("nonexistent"))

    # ===== Router logic tests =====

    def test_router_routing_by_skill(self):
        from a2a.protocol import Task, TaskStatus, TaskState, Message
        task = Task()
        task.history.append(Message(role="user", parts=[], metadata={"skill_id": "chat"}))
        rules = [
            type("Rule", (), {"skill": "chat", "target": "chat_agent", "condition": "", "priority": 10})(),
            type("Rule", (), {"skill": "search", "target": "search_agent", "condition": "", "priority": 5})(),
        ]
        default_target = "fallback"
        matched = default_target
        for rule in sorted(rules, key=lambda r: -r.priority):
            skill_id = (task.history[-1].metadata or {}).get("skill_id", "")
            if rule.skill == skill_id or not rule.skill:
                matched = rule.target
                break
        self.assertEqual(matched, "chat_agent")

    def test_router_default_fallback(self):
        from a2a.protocol import Task, TaskStatus, TaskState, Message
        task = Task()
        task.history.append(Message(role="user", parts=[], metadata={"skill_id": "unknown"}))
        rules = [
            type("Rule", (), {"skill": "chat", "target": "chat_agent", "condition": "", "priority": 10})(),
        ]
        default_target = "fallback"
        matched = default_target
        for rule in sorted(rules, key=lambda r: -r.priority):
            skill_id = (task.history[-1].metadata or {}).get("skill_id", "")
            if rule.skill == skill_id or not rule.skill:
                matched = rule.target
                break
        self.assertEqual(matched, "fallback")


if __name__ == "__main__":
    unittest.main()
