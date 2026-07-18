"""Bundle CLI 子命令 — run / rpc / validate / trust。"""
from __future__ import annotations

import argparse
import json
import sys


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="fangyu bundle", description="Agent Bundle 工具")
    sub = p.add_subparsers(dest="command", required=True)

    create_p = sub.add_parser("create", help="按 profile 工厂生成 Bundle")
    create_p.add_argument(
        "--profile", default="opencode",
        help="opencode | workbuddy | multi | action",
    )
    create_p.add_argument("--dest", default="", help="输出目录（须为空或不存在）")
    create_p.add_argument("--name", default=None, help="Agent 显示名")
    create_p.add_argument("--port", type=int, default=9001)
    create_p.add_argument("--max-turns", type=int, default=12)
    create_p.add_argument("--workspace", default="", help="绑定外部项目根目录")
    create_p.add_argument("--intent", default="", help="multi profile：协作意图（生成 topology）")
    create_p.add_argument("--template", default="", help="multi：intent 模板 id（可选）")
    create_p.add_argument("--list-profiles", action="store_true", help="列出可用 profile")

    run_p = sub.add_parser("run", help="启动 Bundle A2A daemon")
    run_p.add_argument("bundle_dir", help="Bundle 目录路径")
    run_p.add_argument("--host", default="127.0.0.1")
    run_p.add_argument("--port", type=int, default=9001)
    run_p.add_argument("--daemon", action="store_true", help="daemon 模式（常驻等待 A2A）")
    run_p.add_argument("--workspace", default="", help="覆盖/绑定外部项目根目录")

    chat_p = sub.add_parser("chat", help="本机对话壳（harness 多轮，会话写入 workspace/.fangyu）")
    chat_p.add_argument("bundle_dir", help="Bundle 目录路径")
    chat_p.add_argument("-m", "--message", default="", help="单轮消息（省略则进入交互）")
    chat_p.add_argument("--workspace", default="", help="绑定外部项目根目录")
    chat_p.add_argument("--clear", action="store_true", help="清空会话历史后开始")

    orch_p = sub.add_parser("orchestrate", help="按 Bundle 内 topology.json 多 Agent 编排")
    orch_p.add_argument("bundle_dir", help="含 config/topology.json 的 Bundle")
    orch_p.add_argument("-m", "--message", required=True, help="任务消息")
    orch_p.add_argument("--workspace", default="", help="绑定外部工作区")
    orch_p.add_argument("--max-turns", type=int, default=8)

    im_p = sub.add_parser("im-bind", help="绑定 IM 通道（默认飞书）到 Bundle")
    im_p.add_argument("bundle_dir")
    im_p.add_argument("--channel", default="feishu", choices=["feishu"])
    im_p.add_argument("--mode", default="chat", choices=["chat", "orchestrate"])
    im_p.add_argument("--verification-token", default="")
    im_p.add_argument("--app-id", default="")
    im_p.add_argument("--app-secret", default="")

    im_in_p = sub.add_parser("im-inbound", help="模拟一条 IM 文本入站（本地测）")
    im_in_p.add_argument("bundle_dir")
    im_in_p.add_argument("-m", "--message", required=True)
    im_in_p.add_argument("--workspace", default="")
    im_in_p.add_argument("--mode", default="", choices=["", "chat", "orchestrate"])

    manage_p = sub.add_parser("manage", help="G2-D 托管：启停 / 状态 / 日志")
    manage_sub = manage_p.add_subparsers(dest="manage_cmd", required=True)
    ms = manage_sub.add_parser("start", help="后台托管启动 Bundle daemon")
    ms.add_argument("bundle_dir")
    ms.add_argument("--name", default="")
    ms.add_argument("--host", default="127.0.0.1")
    ms.add_argument("--port", type=int, default=0)
    ms.add_argument("--workspace", default="")
    ms.add_argument("--no-wait", action="store_true")
    manage_sub.add_parser("list", help="列出托管实例")
    mst = manage_sub.add_parser("status", help="查看实例状态")
    mst.add_argument("instance_id", nargs="?", default="")
    mstop = manage_sub.add_parser("stop", help="停止托管实例")
    mstop.add_argument("instance_id")
    mlogs = manage_sub.add_parser("logs", help="查看托管日志")
    mlogs.add_argument("instance_id")
    mlogs.add_argument("--tail", type=int, default=80)
    mrm = manage_sub.add_parser("rm", help="停止并移除登记")
    mrm.add_argument("instance_id")

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
        workspace=args.workspace or None,
        intent=args.intent or None,
        template=args.template or None,
    )
    out: dict = {
        "ok": True,
        "profile": args.profile,
        "bundle": str(root),
        "workspace": args.workspace or str(root / "workspace"),
        "run": f"python -m fangyu --run-bundle {root}",
        "chat": f"python -m fangyu bundle chat {root}"
        + (f" --workspace {args.workspace}" if args.workspace else ""),
    }
    topo = root / "config" / "topology.json"
    if topo.is_file():
        out["orchestrate"] = (
            f"python -m fangyu bundle orchestrate {root} -m \"...\""
            + (f" --workspace {args.workspace}" if args.workspace else "")
        )
        out["topology"] = str(topo)
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    from fangyu.engine.executor import register_executors
    from fangyu.engine.bundle_runtime import run_bundle_server

    register_executors()
    run_bundle_server(
        args.bundle_dir,
        host=args.host,
        port=args.port,
        daemon=args.daemon,
        workspace=args.workspace or None,
    )
    return 0


def cmd_chat(args: argparse.Namespace) -> int:
    from fangyu.engine.bundle_chat import chat_once, format_failure_hint, prepare_bundle_chat
    from fangyu.engine.bundle_session import clear_chat, load_chat

    ws = args.workspace or None
    prepare_bundle_chat(args.bundle_dir, workspace=ws)
    if args.clear:
        clear_chat()

    def _one(msg: str) -> int:
        out = chat_once(args.bundle_dir, msg, workspace=ws)
        agent = out.get("agent") or "agent"
        if out.get("success"):
            print(f"{agent}> {out.get('result')}")
            return 0
        hint = format_failure_hint(out.get("error") or out.get("result"))
        print(f"{agent}> {hint or out.get('error') or '失败'}", file=sys.stderr)
        return 1

    if args.message:
        return _one(args.message)

    print(f"fangyu bundle chat → {args.bundle_dir}")
    if ws:
        print(f"workspace: {ws}")
    hist = load_chat(limit=5)
    if hist:
        print(f"(已有 {len(load_chat())} 条会话，输入 /quit 退出，/clear 清空)")
    while True:
        try:
            line = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not line:
            continue
        if line in ("/quit", "/exit", ":q"):
            return 0
        if line == "/clear":
            clear_chat()
            print("(会话已清空)")
            continue
        _one(line)


def cmd_orchestrate(args: argparse.Namespace) -> int:
    from fangyu.engine.bundle_orchestrate import run_topology

    result = run_topology(
        args.bundle_dir,
        args.message,
        workspace=args.workspace or None,
        max_turns=args.max_turns,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return 0 if result.get("success") else 1


def cmd_im_bind(args: argparse.Namespace) -> int:
    from fangyu.engine.im_feishu import bind_feishu_channel

    path = bind_feishu_channel(
        args.bundle_dir,
        mode=args.mode,
        verification_token=args.verification_token,
        app_id=args.app_id,
        app_secret=args.app_secret,
    )
    print(json.dumps({
        "ok": True,
        "channel": args.channel,
        "im_config": str(path),
        "hint": "飞书事件订阅 URL → Bundle 的 POST /im/feishu，或平台 /api/v1/im/feishu",
    }, ensure_ascii=False, indent=2))
    return 0


def cmd_im_inbound(args: argparse.Namespace) -> int:
    from fangyu.engine.im_inbound import handle_inbound_text

    result = handle_inbound_text(
        args.bundle_dir,
        args.message,
        workspace=args.workspace or None,
        mode=args.mode or None,  # type: ignore[arg-type]
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return 0 if result.get("success") else 1


def cmd_manage(args: argparse.Namespace) -> int:
    from fangyu.engine import managed_host as mh

    cmd = args.manage_cmd
    try:
        if cmd == "start":
            out = mh.start_instance(
                args.bundle_dir,
                name=args.name or None,
                host=args.host,
                port=args.port or None,
                workspace=args.workspace or None,
                wait=not args.no_wait,
            )
            print(json.dumps(out, ensure_ascii=False, indent=2, default=str))
            return 0 if out.get("status") in ("running", "starting") or out.get("alive") else 1
        if cmd == "list":
            print(json.dumps({"instances": mh.list_instances()}, ensure_ascii=False, indent=2, default=str))
            return 0
        if cmd == "status":
            if args.instance_id:
                inst = mh.get_instance(args.instance_id)
                if not inst:
                    print(json.dumps({"error": f"not found: {args.instance_id}"}), file=sys.stderr)
                    return 1
                print(json.dumps(inst, ensure_ascii=False, indent=2, default=str))
            else:
                print(json.dumps({"instances": mh.list_instances()}, ensure_ascii=False, indent=2, default=str))
            return 0
        if cmd == "stop":
            print(json.dumps(mh.stop_instance(args.instance_id), ensure_ascii=False, indent=2, default=str))
            return 0
        if cmd == "logs":
            print(json.dumps(mh.read_logs(args.instance_id, tail=args.tail), ensure_ascii=False, indent=2))
            return 0
        if cmd == "rm":
            print(json.dumps(mh.remove_instance(args.instance_id), ensure_ascii=False, indent=2, default=str))
            return 0
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
        return 1
    return 1


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
    if args.command == "chat":
        return cmd_chat(args)
    if args.command == "orchestrate":
        return cmd_orchestrate(args)
    if args.command == "im-bind":
        return cmd_im_bind(args)
    if args.command == "im-inbound":
        return cmd_im_inbound(args)
    if args.command == "manage":
        return cmd_manage(args)
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
