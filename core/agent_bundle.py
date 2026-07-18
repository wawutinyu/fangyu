"""Agent Bundle — 导出/加载/校验标准包（L1 Phase 1）。"""
from __future__ import annotations

import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fangyu.a2a.trust.identity import AgentIdentity
from fangyu.core.constitution import load_constitution

BUNDLE_VERSION = "1.0"
PLATFORM_ID = "fangyu"


class BundleError(ValueError):
    pass


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _default_worker_flow(skill_name: str = "default") -> dict[str, Any]:
    """Action Loop 默认 skill：observe → plan → act → verify。"""
    from fangyu.core.action_loop import get_action_loop_flow
    return get_action_loop_flow(skill_name, skill_name)


def normalize_flow(flow: dict[str, Any]) -> dict[str, Any]:
    nodes = flow.get("nodes") or []
    edges = flow.get("edges") or flow.get("links") or []
    out_nodes = []
    for n in nodes:
        if "data" in n and isinstance(n["data"], dict):
            out_nodes.append(n)
        else:
            out_nodes.append({
                "id": n.get("id", ""),
                "data": {
                    "originType": n.get("originType") or n.get("type", "start"),
                    "label": n.get("label") or n.get("name", ""),
                    "config": n.get("config") or {},
                    "inner_nodes": n.get("inner_nodes") or [],
                    "inner_links": n.get("inner_links") or [],
                },
            })
    out_edges = []
    for e in edges:
        out_edges.append({
            "source": e.get("source") or e.get("sourceNodeId", ""),
            "target": e.get("target") or e.get("targetNodeId", ""),
            "data": e.get("data") or {"linkType": e.get("linkType", "serial"), "mappings": e.get("mappings") or {}},
        })
    return {"nodes": out_nodes, "edges": out_edges}


def create_agent_bundle(
    dest: str | Path,
    *,
    name: str,
    skills: dict[str, dict[str, Any]] | None = None,
    agent_card: dict[str, Any] | None = None,
    worker_only: bool = True,
    agent_kind: str = "worker",
    a2a_port: int = 9001,
    require_envelope: bool = True,
    trusted_peers: list[dict[str, str]] | None = None,
    identity: AgentIdentity | None = None,
    embed_private_key: bool = True,
    mqtt_triggers: list[dict[str, Any]] | None = None,
    constitution: dict[str, Any] | None = None,
    toolbelt: str | None = None,
    profile: str | None = None,
) -> Path:
    """创建 Agent Bundle 目录。"""
    root = Path(dest)
    if root.exists() and any(root.iterdir()):
        raise BundleError(f"目标目录非空: {root}")
    root.mkdir(parents=True, exist_ok=True)

    agent_id = f"fyu:agent:{uuid.uuid4().hex[:16]}"
    ident = identity or AgentIdentity.generate()
    skills = skills or {"default": _default_worker_flow("default")}

    if agent_kind == "interface":
        worker_only = False
    elif agent_kind == "worker":
        worker_only = True
    # hybrid: respect explicit worker_only arg

    user_enabled = not worker_only
    a2a_url = f"http://127.0.0.1:{a2a_port}/rpc"

    skill_entries: list[dict[str, str]] = []
    for skill_id, flow in skills.items():
        skill_dir = root / "skills" / skill_id
        skill_dir.mkdir(parents=True, exist_ok=True)
        normalized = normalize_flow(flow)
        (skill_dir / "flow.json").write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
        meta = flow.get("meta") if isinstance(flow.get("meta"), dict) else {}
        (skill_dir / "meta.json").write_text(
            json.dumps({"skill_id": skill_id, "kind": meta.get("kind", "action")}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        skill_entries.append({"id": skill_id, "name": meta.get("name") or skill_id, "description": meta.get("description") or ""})

    card = agent_card or {
        "name": name,
        "version": "1.0.0",
        "description": f"fangyu exported agent: {name}",
        "capabilities": {"streaming": False, "pushNotifications": False},
        "skills": skill_entries or [{"id": "default", "name": "default", "description": "Default action skill"}],
        "interfaces": {
            "user": {"enabled": user_enabled},
            "a2a": {"enabled": True, "url": a2a_url},
        },
        "defaultInterface": {"type": "a2a", "url": a2a_url},
        "metadata": {"agentKind": agent_kind, "workerOnly": worker_only},
    }
    card.setdefault("interfaces", {
        "user": {"enabled": user_enabled},
        "a2a": {"enabled": True, "url": a2a_url},
    })
    if "metadata" not in card:
        card["metadata"] = {"agentKind": agent_kind, "workerOnly": worker_only}
    if profile:
        card.setdefault("metadata", {})["profile"] = profile

    from fangyu.core.agent_card import assert_agent_card, write_well_known_agent_card
    assert_agent_card(card)

    manifest = {
        "bundle_version": BUNDLE_VERSION,
        "platform": PLATFORM_ID,
        "agent_id": agent_id,
        "name": name,
        "exported_at": _utc_now(),
        "runtime_entry": "python -m fangyu --run-bundle",
        "capabilities": {
            "a2a_server": True,
            "a2a_client": True,
            "user_interface": user_enabled,
            "worker_only": worker_only,
            "agent_kind": agent_kind,
            "harness": profile in ("opencode", "workbuddy", "multi") or any(
                (f.get("meta") or {}).get("kind") == "harness" for f in skills.values()
            ),
        },
        "protocols": ["a2a/1.0", "fangyu-envelope/1.0"],
        "skills": list(skills.keys()),
    }
    if profile:
        manifest["profile"] = profile

    constitution_doc = constitution if isinstance(constitution, dict) else load_constitution()
    const_payload = json.dumps(
        {"agent_id": agent_id, "constitution_version": constitution_doc.get("version", "1.0"), "signed_at": _utc_now()},
        sort_keys=True,
    )
    const_sig = ident.sign(const_payload)

    identity_doc = {
        "agent_id": agent_id,
        "algorithm": "Ed25519",
        "public_key": ident.public_key,
        "constitution": {
            "version": constitution_doc.get("version", "1.0"),
            "payload": const_payload,
            "signature": const_sig,
        },
    }
    if embed_private_key:
        identity_doc["private_key_hex"] = ident.private_key_bytes.hex()
    else:
        identity_doc["private_key_delivery"] = "environment"
        identity_doc["private_key_env"] = "FANGYU_AGENT_PRIVATE_KEY"

    interfaces = {
        "a2a_listen": {"host": "127.0.0.1", "port": a2a_port, "path": "/rpc"},
        "user_api": {"enabled": user_enabled},
        "trust_policy": {
            "allow_external_agents": True,
            "require_envelope": require_envelope,
            "trusted_peers": trusted_peers or [],
        },
    }
    if mqtt_triggers:
        interfaces["event_triggers"] = {"mqtt": mqtt_triggers}

    (root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (root / "agent.card.json").write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    write_well_known_agent_card(root, card)
    (root / "identity.json").write_text(json.dumps(identity_doc, ensure_ascii=False, indent=2), encoding="utf-8")
    (root / "constitution.json").write_text(json.dumps(constitution_doc, ensure_ascii=False, indent=2), encoding="utf-8")
    (root / "config").mkdir(exist_ok=True)
    (root / "config" / "interfaces.json").write_text(json.dumps(interfaces, ensure_ascii=False, indent=2), encoding="utf-8")

    # 工具闭包清单（运行时 toolbelt 实现仍在引擎内；清单随包可审计）
    if toolbelt:
        from fangyu.core.agent_factory import toolbelt_manifest
        from fangyu.core.materials import default_materials, write_materials

        write_materials(root, default_materials())
        tb = toolbelt_manifest(toolbelt)
        if tb:
            (root / "config" / "toolbelt.json").write_text(
                json.dumps(tb, ensure_ascii=False, indent=2), encoding="utf-8",
            )

    # 包内 DATA_DIR：run-bundle 时切到这里，宪法/审计与宿主隔离
    data_dir = root / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "constitution.json").write_text(
        json.dumps(constitution_doc, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    # 技能注册表占位（闭包：将来可拷贝 md skills）
    skills_data = data_dir / "skills"
    skills_data.mkdir(exist_ok=True)
    (skills_data / "registry.json").write_text("[]", encoding="utf-8")

    (root / "workspace").mkdir(exist_ok=True)
    (root / "workspace" / ".fangyu").mkdir(exist_ok=True)

    _write_start_scripts(root)
    return root


def _write_start_scripts(root: Path) -> None:
    bat = f"""@echo off
echo Starting fangyu Agent Bundle...
py -3 -m fangyu --run-bundle "{root.as_posix()}"
"""
    sh = f"""#!/usr/bin/env bash
echo "Starting fangyu Agent Bundle..."
exec py -3 -m fangyu --run-bundle "{root.as_posix()}"
"""
    (root / "start.bat").write_text(bat, encoding="utf-8")
    start_sh = root / "start.sh"
    start_sh.write_text(sh, encoding="utf-8")
    try:
        start_sh.chmod(0o755)
    except OSError:
        pass


def activate_bundle_runtime_context(bundle_root: str | Path) -> Path:
    """将进程 DATA_DIR 切到 bundle/data，并以包根 constitution.json 为权威副本。

    返回生效的 data 目录。宿主全局 data/ 不再参与该 Bundle 的宪法/审计读写。
    """
    from fangyu.core.config import set_data_dir

    root = Path(bundle_root).resolve()
    data_dir = root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    src = root / "constitution.json"
    dst = data_dir / "constitution.json"
    if src.is_file():
        shutil.copy2(src, dst)
    set_data_dir(data_dir)
    return data_dir


def load_agent_bundle(path: str | Path) -> dict[str, Any]:
    """加载并校验 Bundle。"""
    root = Path(path)
    if not root.is_dir():
        raise BundleError(f"Bundle 目录不存在: {root}")

    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        raise BundleError("缺少 manifest.json")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("platform") != PLATFORM_ID:
        raise BundleError(f"非 fangyu bundle: {manifest.get('platform')}")

    card = json.loads((root / "agent.card.json").read_text(encoding="utf-8"))
    identity = json.loads((root / "identity.json").read_text(encoding="utf-8"))
    interfaces = {}
    iface_path = root / "config" / "interfaces.json"
    if iface_path.exists():
        interfaces = json.loads(iface_path.read_text(encoding="utf-8"))

    constitution = {}
    cpath = root / "constitution.json"
    if cpath.exists():
        constitution = json.loads(cpath.read_text(encoding="utf-8"))

    skills: dict[str, dict[str, Any]] = {}
    skills_root = root / "skills"
    if skills_root.is_dir():
        for skill_dir in sorted(skills_root.iterdir()):
            if not skill_dir.is_dir():
                continue
            flow_file = skill_dir / "flow.json"
            if flow_file.exists():
                skills[skill_dir.name] = json.loads(flow_file.read_text(encoding="utf-8"))

    if not skills:
        raise BundleError("Bundle 无 skill flow")

    validate_bundle_integrity(manifest, identity)

    return {
        "root": root,
        "manifest": manifest,
        "agent_card": card,
        "identity": identity,
        "interfaces": interfaces,
        "constitution": constitution,
        "skills": skills,
    }


def validate_bundle_integrity(manifest: dict[str, Any], identity: dict[str, Any]) -> None:
    if manifest.get("agent_id") != identity.get("agent_id"):
        raise BundleError("manifest.agent_id 与 identity.agent_id 不一致")
    const = identity.get("constitution") or {}
    payload = const.get("payload")
    signature = const.get("signature")
    public_key = identity.get("public_key")
    if payload and signature and public_key:
        if not AgentIdentity.verify(public_key, payload, signature):
            raise BundleError("宪法签署签名无效")


def bundle_to_flow_mappings(bundle: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for skill_id, flow in bundle["skills"].items():
        out[skill_id] = {"nodes": flow.get("nodes", []), "edges": flow.get("edges", [])}
    return out


def resolve_agent_identity(bundle: dict[str, Any]) -> AgentIdentity:
    """从 bundle + 环境变量解析 AgentIdentity（优先 FANGYU_AGENT_PRIVATE_KEY）。"""
    ident_doc = bundle["identity"]
    env_key = os.getenv("FANGYU_AGENT_PRIVATE_KEY", "").strip()
    if env_key:
        return AgentIdentity.from_private_bytes(bytes.fromhex(env_key))
    embedded = ident_doc.get("private_key_hex")
    if embedded:
        return AgentIdentity.from_private_bytes(bytes.fromhex(embedded))
    env_name = ident_doc.get("private_key_env") or "FANGYU_AGENT_PRIVATE_KEY"
    raise BundleError(
        f"Bundle 未嵌入私钥；请设置环境变量 {env_name}（hex 格式 Ed25519 私钥）"
    )


def add_mqtt_trigger(
    bundle_dir: str | Path,
    topic: str,
    *,
    skill_id: str = "default",
    use_sim: bool = True,
) -> None:
    """向 Bundle 添加 MQTT 事件触发（幂等按 topic）。"""
    root = Path(bundle_dir)
    iface_path = root / "config" / "interfaces.json"
    if not iface_path.exists():
        raise BundleError(f"缺少 config/interfaces.json: {root}")
    cfg = json.loads(iface_path.read_text(encoding="utf-8"))
    events = cfg.setdefault("event_triggers", {}).setdefault("mqtt", [])
    entry = {"topic": topic, "skill_id": skill_id, "use_sim": use_sim}
    events = [e for e in events if e.get("topic") != topic]
    events.append(entry)
    cfg["event_triggers"]["mqtt"] = events
    iface_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def get_public_identity(bundle: dict[str, Any] | str | Path) -> dict[str, str]:
    """从 bundle 提取公钥侧身份（不含私钥）。"""
    if not isinstance(bundle, dict):
        bundle = load_agent_bundle(bundle)
    ident = bundle["identity"]
    trust = (bundle.get("interfaces") or {}).get("trust_policy") or {}
    return {
        "agent_id": ident["agent_id"],
        "public_key": ident["public_key"],
        "require_envelope": bool(trust.get("require_envelope", False)),
    }


def add_trusted_peer(
    bundle_dir: str | Path,
    peer_agent_id: str,
    peer_public_key: str,
    *,
    allowed_skills: list[str] | None = None,
) -> None:
    """向 Bundle 的 trust_policy.trusted_peers 添加对端（幂等）。"""
    root = Path(bundle_dir)
    iface_path = root / "config" / "interfaces.json"
    if not iface_path.exists():
        raise BundleError(f"缺少 config/interfaces.json: {root}")
    cfg = json.loads(iface_path.read_text(encoding="utf-8"))
    policy = cfg.setdefault("trust_policy", {})
    peers: list[dict] = list(policy.get("trusted_peers") or [])
    entry = {
        "agent_id": peer_agent_id,
        "public_key": peer_public_key,
        "allowed_skills": allowed_skills or ["*"],
    }
    peers = [p for p in peers if p.get("agent_id") != peer_agent_id]
    peers.append(entry)
    policy["trusted_peers"] = peers
    iface_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def get_run_instructions(bundle_dir: str | Path, *, host: str = "127.0.0.1", port: int | None = None) -> dict[str, str]:
    """生成 Bundle 运行指引（Happy Path Runbook）。"""
    bundle = load_agent_bundle(bundle_dir)
    name = bundle["manifest"].get("name") or "agent"
    listen = (bundle.get("interfaces") or {}).get("a2a_listen") or {}
    p = port if port is not None else int(listen.get("port") or 9001)
    h = host or listen.get("host") or "127.0.0.1"
    rpc_url = f"http://{h}:{p}/rpc"
    root = Path(bundle_dir)
    return {
        "name": name,
        "agent_id": bundle["manifest"]["agent_id"],
        "run": f'py -3 -m fangyu bundle run "{root}" --port {p}',
        "health": f"http://{h}:{p}/health",
        "rpc": rpc_url,
        "validate": f'py -3 -m fangyu bundle validate "{root}"',
        "rpc_example": f'py -3 -m fangyu bundle rpc "{root}" --url {rpc_url} -m "hello"',
    }


def export_bundle_zip(src: str | Path, dest_zip: str | Path) -> Path:
    """将 bundle 目录打包为 zip。"""
    src_path = Path(src)
    dest = Path(dest_zip)
    dest.parent.mkdir(parents=True, exist_ok=True)
    base = dest.stem
    shutil.make_archive(str(dest.with_suffix("")), "zip", root_dir=src_path.parent, base_dir=src_path.name)
    return dest if dest.suffix == ".zip" else dest.with_suffix(".zip")
