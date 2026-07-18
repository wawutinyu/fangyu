"""Bundle CLI 子命令 — run / rpc / validate / trust。"""
from __future__ import annotations

import argparse
import json
import sys


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="fangyu bundle", description="Agent Bundle 工具")
    sub = p.add_subparsers(dest="command", required=True)

    create_p = sub.add_parser("create", help="按 profile 工厂生成 Bundle")
    create_p.add_argument("--profile", default="opencode", help="opencode | action")
    create_p.add_argument("--dest", default="", help="输出目录（须为空或不存在）")
    create_p.add_argument("--name", default=None, help="Agent 显示名")
    create_p.add_argument("--port", type=int, default=9001)
    create_p.add_argument("--max-turns", type=int, default=12)
    create_p.add_argument("--list-profiles", action="store_true", help="列出可用 profile")

    run_p = sub.add_parser("run", help="启动 Bundle A2A daemon")
    run_p.add_argument("bundle_dir", help="Bundle 目录路径")
    run_p.add_argument("--host", default="127.0.0.1")
    run_p.add_argument("--port", type=int, default=9001)
    run_p.add_argument("--daemon", action="store_true", help="daemon 模式（常驻等待 A2A）")

    rpc_p = sub.add_parser("rpc", help="向 Bundle RPC 发送 a2a.send_message")
    rpc_p.add_argument("bundle_dir", help="调用方 Bundle（用于签名身份）")
    rpc_p.add_argument("--url", required=True, help="目标 RPC URL")
    rpc_p.add_argument("--message", "-m", default="hello", help="消息文本")
    rpc_p.add_argument("--skill", default="default", help="skill_id")
    rpc_p.add_argument("--target", default="", help="目标 Agent 名称（默认同 URL 端 Agent）")
    rpc_p.add_argument("--no-sign", action="store_true", help="不签名（仅 require_envelope=false 时）")

    val_p = sub.add_parser("validate", help="校验 Bundle 完整性")
    val_p.add_argument("bundle_dir")

    trust_p = sub.add_parser("trust", help="信任管理")
    trust_sub = trust_p.add_subparsers(dest="trust_cmd", required=True)
    add_p = trust_sub.add_parser("add", help="添加 trusted peer")
    add_p.add_argument("bundle_dir", help="接收方 Bundle 目录")
    add_p.add_argument("--from", dest="peer_dir", required=True, help="对端 Bundle 目录")

    return p


def cmd_create(args: argparse.Namespace) -> int:
    from fangyu.core.agent_factory import build_from_profile, list_profiles

    if args.list_profiles:
        print(json.dumps(list_profiles(), ensure_ascii=False, indent=2))
        return 0
    if not args.dest:
        print("error: --dest is required (unless --list-profiles)", file=sys.stderr)
        return 2
    root = build_from_profile(
        args.profile,
        args.dest,
        name=args.name,
        a2a_port=args.port,
        max_turns=args.max_turns,
    )
    print(json.dumps({
        "ok": True,
        "profile": args.profile,
        "bundle": str(root),
        "run": f"python -m fangyu --run-bundle {root}",
    }, ensure_ascii=False, indent=2))
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    from fangyu.engine.executor import register_executors
    from fangyu.engine.bundle_runtime import run_bundle_server

    register_executors()
    run_bundle_server(args.bundle_dir, host=args.host, port=args.port, daemon=args.daemon)
    return 0


def cmd_rpc(args: argparse.Namespace) -> int:
    from fangyu.core.agent_bundle import load_agent_bundle
    from fangyu.engine.bundle_a2a_client import identity_from_bundle, rpc_call
    import urllib.request

    bundle = load_agent_bundle(args.bundle_dir)
    agent_id, identity = identity_from_bundle(bundle)
    target = args.target
    if not target:
        base = args.url.rsplit("/rpc", 1)[0]
        try:
            with urllib.request.urlopen(f"{base}/health", timeout=5) as resp:
                target = json.loads(resp.read().decode("utf-8")).get("agent", "")
        except Exception:
            target = bundle["agent_card"].get("name", "")

    body = {
        "jsonrpc": "2.0",
        "method": "a2a.send_message",
        "params": {
            "targetAgent": target,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": args.message}],
                "metadata": {"skill_id": args.skill},
            },
        },
        "id": "cli",
    }

    if args.no_sign:
        import urllib.request as ur

        req = ur.Request(
            args.url,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with ur.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        if "error" in result:
            print(json.dumps(result["error"], ensure_ascii=False, indent=2), file=sys.stderr)
            return 1
        task = result.get("result", {})
    else:
        task = rpc_call(
            args.url,
            "a2a.send_message",
            body["params"],
            agent_id=agent_id,
            identity=identity,
            req_id="cli",
        )

    print(json.dumps(task, ensure_ascii=False, indent=2))
    state = (task.get("status") or {}).get("state", "")
    return 0 if state == "completed" else 1


def cmd_validate(args: argparse.Namespace) -> int:
    from fangyu.core.agent_bundle import load_agent_bundle

    try:
        bundle = load_agent_bundle(args.bundle_dir)
        print(json.dumps({
            "valid": True,
            "agent_id": bundle["manifest"]["agent_id"],
            "name": bundle["manifest"].get("name"),
            "skills": list(bundle["skills"].keys()),
            "require_envelope": (bundle.get("interfaces") or {}).get("trust_policy", {}).get("require_envelope"),
        }, ensure_ascii=False, indent=2))
        return 0
    except Exception as e:
        print(json.dumps({"valid": False, "error": str(e)}, ensure_ascii=False, indent=2))
        return 1


def cmd_trust_add(args: argparse.Namespace) -> int:
    from fangyu.core.agent_bundle import add_trusted_peer, get_public_identity, load_agent_bundle

    peer = load_agent_bundle(args.peer_dir)
    ident = get_public_identity(peer)
    add_trusted_peer(args.bundle_dir, ident["agent_id"], ident["public_key"])
    print(json.dumps({
        "ok": True,
        "bundle": args.bundle_dir,
        "added_peer": ident["agent_id"],
    }, ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "create":
        return cmd_create(args)
    if args.command == "run":
        return cmd_run(args)
    if args.command == "rpc":
        return cmd_rpc(args)
    if args.command == "validate":
        return cmd_validate(args)
    if args.command == "trust":
        if args.trust_cmd == "add":
            return cmd_trust_add(args)
    parser.print_help()
    return 1
