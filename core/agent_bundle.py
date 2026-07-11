"""Agent Bundle — 导出/加载/校验标准包（L1 Phase 1）。"""
from __future__ import annotations

import json
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
    """Action-first 默认 skill：code 干活，非纯 LLM 聊天。"""
    return {
        "nodes": [
            {"id": "s", "data": {"originType": "start", "label": "start", "config": {}}},
            {
                "id": "act",
                "data": {
                    "originType": "code",
                    "label": "act",
                    "config": {"code": "result = 'processed: ' + str(_input.get('query') or _input.get('message') or '')"},
                },
            },
            {"id": "o", "data": {"originType": "output", "label": "output", "config": {}}},
        ],
        "edges": [
            {"source": "s", "target": "act", "data": {}},
            {"source": "act", "target": "o", "data": {}},
        ],
        "meta": {"skill_id": skill_name, "kind": "action"},
    }


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

    manifest = {
        "bundle_version": BUNDLE_VERSION,
        "platform": PLATFORM_ID,
        "agent_id": agent_id,
        "name": name,
        "exported_at": _utc_now(),
        "runtime_entry": "runtime/main.py",
        "capabilities": {
            "a2a_server": True,
            "a2a_client": True,
            "user_interface": user_enabled,
            "worker_only": worker_only,
            "agent_kind": agent_kind,
        },
        "protocols": ["a2a/1.0", "fangyu-envelope/1.0"],
        "skills": list(skills.keys()),
    }

    constitution = load_constitution()
    const_payload = json.dumps(
        {"agent_id": agent_id, "constitution_version": constitution.get("version", "1.0"), "signed_at": _utc_now()},
        sort_keys=True,
    )
    const_sig = ident.sign(const_payload)

    identity_doc = {
        "agent_id": agent_id,
        "algorithm": "Ed25519",
        "public_key": ident.public_key,
        "private_key_hex": ident.private_key_bytes.hex(),
        "constitution": {
            "version": constitution.get("version", "1.0"),
            "payload": const_payload,
            "signature": const_sig,
        },
    }

    interfaces = {
        "a2a_listen": {"host": "127.0.0.1", "port": a2a_port, "path": "/rpc"},
        "user_api": {"enabled": user_enabled},
        "trust_policy": {
            "allow_external_agents": True,
            "require_envelope": require_envelope,
            "trusted_peers": trusted_peers or [],
        },
    }

    (root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (root / "agent.card.json").write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    (root / "identity.json").write_text(json.dumps(identity_doc, ensure_ascii=False, indent=2), encoding="utf-8")
    (root / "constitution.json").write_text(json.dumps(constitution, ensure_ascii=False, indent=2), encoding="utf-8")
    (root / "config").mkdir(exist_ok=True)
    (root / "config" / "interfaces.json").write_text(json.dumps(interfaces, ensure_ascii=False, indent=2), encoding="utf-8")

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


def export_bundle_zip(src: str | Path, dest_zip: str | Path) -> Path:
    """将 bundle 目录打包为 zip。"""
    src_path = Path(src)
    dest = Path(dest_zip)
    dest.parent.mkdir(parents=True, exist_ok=True)
    base = dest.stem
    shutil.make_archive(str(dest.with_suffix("")), "zip", root_dir=src_path.parent, base_dir=src_path.name)
    return dest if dest.suffix == ".zip" else dest.with_suffix(".zip")
