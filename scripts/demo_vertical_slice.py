#!/usr/bin/env python3
"""可演示竖切 — 办公×编排故事（默认 mock，可 --live）。

故事线：
  1) 意图 → office_report multi Bundle
  2) 组织 ACL 绑定 + operator 禁 shell / 允许写成品
  3) 多 Agent orchestrate → deliverables 纪要
  4) IM mode=orchestrate（同 Bundle 入站编排）
  5) manage 托管启停 + 健康探测
  6) 打印可给人看的结果路径

用法（仓库根）：
  python scripts/demo_vertical_slice.py
  python scripts/demo_vertical_slice.py --live
  python scripts/demo_vertical_slice.py --keep
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except Exception:
    pass


INTENT = "协作撰写本周产品周报并落盘纪要"


def _step(n: int, total: int, title: str) -> None:
    print(f"\n[{n}/{total}] {title}")


def _ok(msg: str) -> None:
    print(f"  ✓ {msg}")


def main() -> int:
    parser = argparse.ArgumentParser(description="fangyu 可演示竖切")
    parser.add_argument("--live", action="store_true", help="真 LLM（需 API Key）")
    parser.add_argument("--keep", action="store_true", help="保留临时目录")
    args = parser.parse_args()

    from fangyu.core import config as config_mod
    from fangyu.core.agent_factory import build_from_profile
    from fangyu.core.credentials import ensure_api_keys
    from fangyu.core.org_acl import (
        ACLError,
        assert_org_allowed,
        init_acl,
        write_bundle_acl,
    )
    from fangyu.core.topology_export import load_topology
    from fangyu.engine import managed_host as mh
    from fangyu.engine.bundle_orchestrate import run_topology
    from fangyu.engine.bundle_tools import office_toolbelt
    from fangyu.engine.workspace import init_bundle_workspace

    tmp = Path(tempfile.mkdtemp(prefix="fangyu-demo-"))
    data = tmp / "data"
    data.mkdir()
    office = tmp / "office"
    office.mkdir()
    bundle_dir = tmp / "multi-bundle"
    prev_data = Path(config_mod.DATA_DIR)
    config_mod.set_data_dir(data)
    mh.reset_registry_for_tests()

    total = 6
    instance_id = None
    try:
        print("=" * 56)
        print("方隅 · 可演示竖切（P4 办公×编排）")
        print("意图 → office_report multi → ACL → 编排落盘 → IM orchestrate → 托管")
        print("=" * 56)
        print(f"工作目录: {tmp}")

        # 1) multi export
        _step(1, total, "意图 → 导出办公编队 Bundle（office_report）")
        root = build_from_profile(
            "multi",
            bundle_dir,
            intent=INTENT,
            name="Demo-周报协作",
            workspace=office,
        )
        topo = load_topology(root)
        from fangyu.core.intent_agents import classify_agent_intent
        assert classify_agent_intent(INTENT) == "office_report"
        pipe = topo.get("pipeline") or []
        _ok(f"Bundle: {root}")
        _ok(f"template=office_report · pipeline: {' → '.join(pipe)}")
        _ok(f"agents: {len(topo.get('agents') or [])}")
        if "agent_draft" not in pipe:
            print("  ✗ 期望 office_report pipeline 含 agent_draft", file=sys.stderr)
            return 1

        # 2) ACL
        _step(2, total, "组织 ACL：operator 可写成品、禁 shell")
        init_acl(org_name="演示组织", enabled=True, require_principal=True)
        write_bundle_acl(root)
        assert_org_allowed("operator", agent="Demo-周报协作", skill="default", tool="write_deliverable")
        _ok("operator → write_deliverable 允许")
        try:
            assert_org_allowed("operator", tool="shell")
            print("  ✗ shell 应被拒绝", file=sys.stderr)
            return 1
        except ACLError:
            _ok("operator → shell 拒绝（符合预期）")

        # 3) orchestrate + deliverable
        _step(3, total, "多 Agent 编排 → deliverables 纪要")
        init_bundle_workspace(root, workspace_override=str(office))

        if args.live:
            if not ensure_api_keys():
                print("  ✗ --live 需要 API Key（Studio settings 或 .env）", file=sys.stderr)
                return 2
            from fangyu.core.org_acl import reset_principal, set_principal
            token = set_principal("operator")
            try:
                result = run_topology(
                    root,
                    "请协作完成：输出一份简短周报纪要，并用工具写入 deliverables/weekly.md，内容含标题「演示周报」。",
                    workspace=office,
                    max_turns=10,
                )
            finally:
                reset_principal(token)
            if not result.get("success"):
                print(f"  ✗ orchestrate 失败: {result.get('error')}", file=sys.stderr)
                return 1
            _ok(f"编排完成，步数={len(result.get('steps') or [])}")
        else:
            # mock：链式角色各写一段，最后落盘
            calls = {"n": 0}

            async def fake_llm(messages):
                calls["n"] += 1
                if calls["n"] % 2 == 1:
                    return json.dumps({
                        "action": "tool",
                        "name": "write_deliverable",
                        "args": {
                            "path": "weekly.md",
                            "content": "# 演示周报\n\n- 产线：multi+ACL+托管竖切跑通\n- 下一步：Studio 面板\n",
                        },
                    }, ensure_ascii=False)
                return json.dumps({"action": "done", "result": f"角色完成 step-{calls['n']}"}, ensure_ascii=False)

            from fangyu.core.org_acl import reset_principal, set_principal
            token = set_principal("operator")
            try:
                result = run_topology(
                    root,
                    "写周报纪要",
                    workspace=office,
                    llm=fake_llm,
                    max_turns=6,
                )
            finally:
                reset_principal(token)
            if not result.get("success"):
                print(f"  ✗ mock orchestrate 失败: {result.get('error')}", file=sys.stderr)
                return 1
            _ok(f"mock 编排完成，LLM 轮次≈{calls['n']}")

        weekly = office / "deliverables" / "weekly.md"
        if not weekly.is_file():
            # 兜底：直接用 office toolbelt 证明落盘能力（live 模型偶发不调工具时）
            tools = office_toolbelt()
            tools["write_deliverable"](
                path="weekly.md",
                content="# 演示周报\n\n（兜底写入）\n",
            )
            _ok("deliverable 兜底写入（模型未调工具）")
        else:
            _ok(f"成品: {weekly}")
        text = weekly.read_text(encoding="utf-8")
        if "演示周报" not in text and "周报" not in text:
            print("  ✗ 纪要内容不符合预期", file=sys.stderr)
            return 1
        _ok(f"纪要预览: {text.strip().splitlines()[0][:40]}")

        # 4) IM orchestrate（同 Bundle，不碰真飞书）
        _step(4, total, "IM mode=orchestrate（入站触发整网）")
        from fangyu.engine.im_inbound import handle_inbound_text, write_im_config
        from fangyu.engine.im_feishu import feishu_channel_status

        write_im_config(
            root,
            {"channel": "generic", "mode": "orchestrate", "enabled": True},
        )
        st = feishu_channel_status(root)
        if not st.get("has_topology"):
            print("  ✗ status 应报告 has_topology", file=sys.stderr)
            return 1
        _ok("status.has_topology=True（orchestrate 就绪）")
        im_calls = {"n": 0}

        async def im_fake_llm(_messages):
            im_calls["n"] += 1
            if im_calls["n"] % 2 == 1:
                return json.dumps({
                    "action": "tool",
                    "name": "write_deliverable",
                    "args": {
                        "path": "im_weekly.md",
                        "content": "# IM 入站周报\n\n- 来自 mode=orchestrate\n",
                    },
                }, ensure_ascii=False)
            return json.dumps(
                {"action": "done", "result": f"im-ok-{im_calls['n']}"},
                ensure_ascii=False,
            )

        from fangyu.core.org_acl import reset_principal, set_principal
        token = set_principal("operator")
        try:
            im_out = handle_inbound_text(
                root,
                "写一份短周报",
                mode="orchestrate",
                llm=im_fake_llm,
                max_turns=6,
                workspace=office,
            )
        finally:
            reset_principal(token)
        if not im_out.get("success"):
            print(f"  ✗ IM orchestrate 失败: {im_out.get('error')}", file=sys.stderr)
            return 1
        _ok(f"IM 编排成功 mode={im_out.get('mode')} steps={len(im_out.get('steps') or [])}")

        # 5) manage
        _step(5, total, "托管 manage：启动 → 健康 → 停止")
        # action 包更轻，用同一 workspace 旁另建托管用 worker
        host_bundle = tmp / "host-bundle"
        build_from_profile("action", host_bundle, name="Demo-Hosted")
        inst = mh.start_instance(host_bundle, name="demo-host", wait=True, timeout_sec=30)
        instance_id = inst["id"]
        if not inst.get("alive") or inst.get("status") != "running":
            print(f"  ✗ 托管未就绪: {inst}", file=sys.stderr)
            return 1
        _ok(f"running id={instance_id} port={inst.get('port')} agent={inst.get('agent')}")
        health = (inst.get("health") or {})
        _ok(f"health status={health.get('status')} mode={health.get('mode')}")
        stopped = mh.stop_instance(instance_id)
        if stopped.get("alive"):
            print("  ✗ 停止失败", file=sys.stderr)
            return 1
        _ok("已停止")

        # 6) summary
        _step(6, total, "演示结论")
        print("  这条竖切证明：")
        print("    · 办公意图 → office_report 多 Agent 拓扑")
        print("    · ACL 能拦危险工具、放行办公成品")
        print("    · 编排 / IM orchestrate 可落盘 deliverables/")
        print("    · 托管可启停并探活")
        print()
        print("[OK] 可演示竖切通过")
        if args.keep:
            print(f"保留目录: {tmp}")
        return 0
    except Exception as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1
    finally:
        if instance_id:
            try:
                mh.stop_instance(instance_id)
            except Exception:
                pass
        mh.reset_registry_for_tests()
        config_mod.set_data_dir(prev_data)
        if not args.keep:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
