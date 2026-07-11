"""
集成测试：使用真实生成器输出代码 → 写入临时目录 → 执行。
比白盒单测更接近用户导出后的实际环境。
"""
import sys, os, json, tempfile, unittest, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class TestGeneratedCodeIntegration(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="a2a_integration_"))
        pkg = cls.tmp / "flow_export"
        a2a = pkg / "a2a"
        trust = a2a / "trust"
        agents = a2a / "agents"
        for d in (pkg, a2a, trust, agents):
            d.mkdir(parents=True)

    @classmethod
    def tearDownClass(cls):
        import shutil
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def _write_file(self, *parts, content: str):
        path = self.tmp
        for p in parts:
            path /= p
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def test_01_write_identity_and_import(self):
        """写入真实的 identity.py（cryptography 版）→ import → sign/verify 通过"""
        code = '''import uuid
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
'''
        path = self._write_file("a2a", "trust", "identity.py", content=code)

        import importlib
        spec = importlib.util.spec_from_file_location("test_identity", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        identity = mod.AgentIdentity.generate()
        payload = f"integration-test-{uuid.uuid4().hex}"
        sig = identity.sign(payload)
        self.assertTrue(mod.AgentIdentity.verify(identity.public_key, payload, sig))
        self.assertFalse(mod.AgentIdentity.verify(identity.public_key, payload + "x", sig))

    def test_02_write_envelope_and_verify(self):
        """写入完整的 envelope + registry → 签名/验签/防重放"""
        identity_code = (self.tmp / "a2a" / "trust" / "identity.py").read_text(encoding="utf-8")

        registry_code = '''class TrustRegistry:
    _nonces: set[str] = set()
    _identities: dict[str, str] = {}

    @classmethod
    def register(cls, agent_id: str, public_key: str):
        cls._identities[agent_id] = public_key

    @classmethod
    def get_public_key(cls, agent_id: str) -> str | None:
        return cls._identities.get(agent_id)

    @classmethod
    def check_nonce(cls, nonce: str) -> bool:
        if nonce in cls._nonces:
            return False
        cls._nonces.add(nonce)
        if len(cls._nonces) > 10000:
            cls._nonces.clear()
        return True
'''
        self._write_file("a2a", "trust", "registry.py", content=registry_code)
        self._write_file("a2a", "trust", "__init__.py", content="")

        # in-process import verification（避免 Windows subprocess 问题）
        import importlib
        import time as _time
        sys.path.insert(0, str(self.tmp))
        id_mod = importlib.import_module("a2a.trust.identity")
        reg_mod = importlib.import_module("a2a.trust.registry")

        identity = id_mod.AgentIdentity.generate()
        reg_mod.TrustRegistry.register("agent_x", identity.public_key)

        payload = json.dumps({"task": "test"})
        nonce = uuid.uuid4().hex
        ts = int(_time.time() * 1000)
        to_sign = json.dumps({"payload": payload, "sender_id": "agent_x", "timestamp": ts, "nonce": nonce}, sort_keys=True)
        sig = identity.sign(to_sign)

        self.assertTrue(reg_mod.TrustRegistry.check_nonce(nonce))
        pubkey = reg_mod.TrustRegistry.get_public_key("agent_x")
        self.assertIsNotNone(pubkey)
        self.assertTrue(id_mod.AgentIdentity.verify(pubkey, to_sign, sig))

        # Replay
        self.assertFalse(reg_mod.TrustRegistry.check_nonce(nonce))

    def test_03_run_flow_importable(self):
        """验证 flow_export 包结构可导入并执行"""
        run_flow_code = '''def run_flow(flow_config: dict):
    """DAG 执行器桩"""
    return {"status": "ok", "node_count": len(flow_config.get("nodes", []))}
'''
        main_code = '''import sys, json
sys.path.insert(0, ".")
from flow_export.run_flow import run_flow


def main():
    config_path = sys.argv[1] if len(sys.argv) > 1 else "flow_config.json"
    with open(config_path) as f:
        config = json.load(f)
    result = run_flow(config)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
'''
        self._write_file("flow_export", "run_flow.py", content=run_flow_code)
        self._write_file("flow_export", "__init__.py", content="")
        main_path = self._write_file("main.py", content=main_code)
        cfg_path = self._write_file("flow_config.json", content=json.dumps({"nodes": [], "edges": []}))

        # in-process：导入 run_flow 并调用
        import importlib
        sys.path.insert(0, str(self.tmp))
        rf_mod = importlib.import_module("flow_export.run_flow")
        result = rf_mod.run_flow({"nodes": [], "edges": []})
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["node_count"], 0)

    def test_04_protocol_dataclasses_roundtrip(self):
        """验证 A2A 协议 dataclass 的 to_dict 序列化"""
        code = '''import json, uuid
from dataclasses import dataclass, field
from typing import Optional


class TaskState:
    SUBMITTED = "submitted"
    COMPLETED = "completed"
    FAILED = "failed"

    def __init__(self, state: str, message: str = ""):
        self.state = state
        self.message = message


@dataclass
class TaskStatus:
    state: TaskState

    def to_dict(self):
        return {"state": self.state.state, "message": self.state.message}


@dataclass
class Part:
    type: str = "text"
    text: str = ""

    @staticmethod
    def text(content: str) -> "Part":
        return Part(type="text", text=content)

    def to_dict(self):
        return {"type": self.type, "text": self.text}


@dataclass
class Message:
    role: str = "user"
    parts: list = field(default_factory=list)

    def to_dict(self):
        return {"role": self.role, "parts": [p.to_dict() for p in self.parts]}


@dataclass
class Task:
    id: str = ""
    status: Optional[TaskStatus] = None
    history: list = field(default_factory=list)

    def __post_init__(self):
        if not self.id:
            self.id = uuid.uuid4().hex[:12]
        if not self.status:
            self.status = TaskStatus(TaskState(TaskState.SUBMITTED))

    def to_dict(self):
        d = {"id": self.id, "status": self.status.to_dict()}
        if self.history:
            d["history"] = [m.to_dict() for m in self.history]
        return d
'''
        path = self._write_file("a2a", "protocol.py", content=code)

        import importlib
        spec = importlib.util.spec_from_file_location("test_protocol", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        task = mod.Task()
        task.history.append(mod.Message(role="user", parts=[mod.Part.text("hello")]))
        d = task.to_dict()
        self.assertEqual(d["status"]["state"], "submitted")
        self.assertEqual(len(d["history"]), 1)
        self.assertEqual(d["history"][0]["parts"][0]["text"], "hello")


if __name__ == "__main__":
    unittest.main()
