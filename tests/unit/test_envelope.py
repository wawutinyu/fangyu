"""a2a.trust.envelope — 签名信封校验"""
import time

from fangyu.a2a.trust.envelope import MessageEnvelope
from fangyu.a2a.trust.identity import AgentIdentity
from fangyu.a2a.trust.registry import TrustRegistry


def _register(agent_id: str, identity: AgentIdentity) -> None:
    TrustRegistry.register(agent_id, identity.public_key, ["*"])


def test_sign_and_verify_ok():
    identity = AgentIdentity.generate()
    agent_id = "agent-a"
    _register(agent_id, identity)
    env = MessageEnvelope.sign('{"hello":1}', agent_id, identity)
    assert MessageEnvelope.verify(env) is True


def test_expired_timestamp_rejected():
    identity = AgentIdentity.generate()
    agent_id = "agent-b"
    _register(agent_id, identity)
    env = MessageEnvelope.sign("payload", agent_id, identity)
    env.timestamp = int(time.time() * 1000) - 400_000  # > 5 min
    assert MessageEnvelope.verify(env) is False


def test_future_timestamp_too_far_rejected():
    identity = AgentIdentity.generate()
    agent_id = "agent-c"
    _register(agent_id, identity)
    env = MessageEnvelope.sign("payload", agent_id, identity)
    env.timestamp = int(time.time() * 1000) + 400_000
    assert MessageEnvelope.verify(env) is False


def test_replay_nonce_rejected():
    identity = AgentIdentity.generate()
    agent_id = "agent-d"
    _register(agent_id, identity)
    env = MessageEnvelope.sign("once", agent_id, identity)
    assert MessageEnvelope.verify(env) is True
    assert MessageEnvelope.verify(env) is False


def test_unknown_sender_rejected():
    identity = AgentIdentity.generate()
    env = MessageEnvelope.sign("x", "ghost", identity)
    assert MessageEnvelope.verify(env) is False


def test_wrong_signature_rejected():
    a = AgentIdentity.generate()
    b = AgentIdentity.generate()
    _register("agent-e", a)
    env = MessageEnvelope.sign("secret", "agent-e", a)
    env.signature = b.sign("tampered")
    assert MessageEnvelope.verify(env) is False


def test_payload_tamper_rejected():
    identity = AgentIdentity.generate()
    agent_id = "agent-f"
    _register(agent_id, identity)
    env = MessageEnvelope.sign('{"ok":true}', agent_id, identity)
    env.payload = '{"ok":false}'
    assert MessageEnvelope.verify(env) is False


def test_to_dict_shape():
    identity = AgentIdentity.generate()
    agent_id = "agent-g"
    _register(agent_id, identity)
    env = MessageEnvelope.sign("p", agent_id, identity)
    d = env.to_dict()
    assert set(d) >= {"payload", "senderId", "timestamp", "nonce", "signature"}
    assert d["senderId"] == agent_id
