#!/usr/bin/env python3
"""
Studio 双预览回归（脚本可重复部分）

覆盖刚翻车的路径：
  1) 意图生成 → 后端 Flow 执行（≈ 底部「预览」聊天）
  2) 同一 Flow 的 code 节点可走 execute-code（≈ 工具栏预览里的 Python 沙箱）

用法（API 须在本机 Terminal 前台跑，勿用已死的 Cursor shell 进程）：
  python scripts/studio_preview_smoke.py
  python scripts/studio_preview_smoke.py --base http://127.0.0.1:8000

退出码：0 全绿；1 失败；2 API 未就绪（明确提示，不当假绿）。
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:8000"
INTENT = "完成产线巡检并写入结果"
CHAT_TEXT = "请执行这次巡检"


def api(method: str, path: str, body: dict | None = None, base: str = DEFAULT_BASE, timeout: float = 60):
    url = f"{base.rstrip('/')}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return resp.status, (json.loads(raw) if raw else {})


def probe(base: str) -> bool:
    for path in ("/docs", "/api/health", "/health"):
        try:
            status, _ = api("GET", path, base=base, timeout=3)
            if status == 200:
                return True
        except Exception:
            continue
    return False


def must_ok(name: str, cond: bool, detail: str = "") -> bool:
    mark = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"[{mark}] {name}{suffix}")
    return cond


def export_to_engine(flow: dict) -> tuple[list, list]:
    nodes = []
    for n in flow.get("nodes") or []:
        nodes.append(
            {
                "id": n["id"],
                "data": {
                    "originType": n.get("type"),
                    "label": n.get("name") or n.get("type"),
                    "config": n.get("config") or {},
                },
            }
        )
    edges = []
    for lk in flow.get("links") or []:
        edges.append(
            {
                "id": lk.get("id") or f"{lk['sourceNodeId']}-{lk['targetNodeId']}",
                "source": lk["sourceNodeId"],
                "target": lk["targetNodeId"],
                "sourceHandle": lk.get("sourceHandle"),
                "targetHandle": lk.get("targetHandle"),
            }
        )
    return nodes, edges


def main() -> int:
    parser = argparse.ArgumentParser(description="Studio preview dual-path smoke")
    parser.add_argument("--base", default=DEFAULT_BASE)
    args = parser.parse_args()
    base = args.base

    print(f"==> studio_preview_smoke @ {base}")
    if not probe(base):
        print(f"[FAIL] API 未就绪: {base}")
        print("提示: 请在本机 Terminal 前台运行：")
        print("  cd ~/Projects/fangyu && source .venv/bin/activate && python -m fangyu --server")
        print("（Cursor agent shell 里起的进程常会挂掉，导致 Studio 502 假失败）")
        return 2

    ok = True

    # --- 路径 1：意图 → 后端 run（底部聊天） ---
    try:
        status, intent = api(
            "POST",
            "/api/v1/intent/to-flow",
            {"intent": INTENT, "use_llm_plan": False},
            base=base,
        )
        ok &= must_ok("意图 to-flow HTTP", status == 200, f"status={status}")
        ok &= must_ok(
            "意图模板 action_loop",
            intent.get("template") == "action_loop",
            str(intent.get("template")),
        )
        flow = intent.get("flow") or {}
        observe = next((n for n in flow.get("nodes") or [] if n.get("name") == "observe"), None)
        code = (observe or {}).get("config", {}).get("code") or ""
        ok &= must_ok("意图 code 为 Python（非 JS return）", "result =" in code and "return {" not in code)
        ok &= must_ok("宪法未拒绝", not (intent.get("scan") or {}).get("blocked"))
    except Exception as exc:
        ok &= must_ok("意图 to-flow", False, str(exc))
        print("[FAIL] 后续跳过（无 Flow）")
        return 1

    nodes, edges = export_to_engine(flow)
    try:
        status, run = api(
            "POST",
            "/api/v1/flow/run",
            {
                "nodes": nodes,
                "edges": edges,
                # 模拟底部聊天：只传 query/message 也必须盖掉 default_value
                "external_inputs": {
                    "query": CHAT_TEXT,
                    "message": CHAT_TEXT,
                },
            },
            base=base,
            timeout=90,
        )
        ok &= must_ok("底部路径 flow/run HTTP", status == 200)
        ok &= must_ok("flow/run success", run.get("success") is True, run.get("error") or "")
        results = run.get("results") or []
        by_name = {r.get("nodeName"): r for r in results}
        observe_out = (by_name.get("observe") or {}).get("outputs") or {}
        goal = (observe_out.get("result") or {}).get("goal")
        ok &= must_ok("聊天文本覆盖输入默认值", goal == CHAT_TEXT, f"goal={goal!r}")
        verify_out = ((by_name.get("verify") or {}).get("outputs") or {}).get("result") or {}
        ok &= must_ok(
            "verify completed（底部可读输出）",
            verify_out.get("verified") is True and verify_out.get("status") == "completed",
            json.dumps(verify_out, ensure_ascii=False),
        )
    except Exception as exc:
        ok &= must_ok("底部路径 flow/run", False, str(exc))

    # --- 路径 2：execute-code（工具栏 Python 沙箱） ---
    try:
        plan_node = next(n for n in flow["nodes"] if n.get("name") == "plan")
        act_node = next(n for n in flow["nodes"] if n.get("name") == "act")
        verify_node = next(n for n in flow["nodes"] if n.get("name") == "verify")
        # 链式：plan ← observe 形态
        obs_payload = {"input": CHAT_TEXT, "phase": "observe", "goal": CHAT_TEXT, "files": []}
        _, plan_res = api(
            "POST",
            "/api/v1/flow/execute-code",
            {"code": plan_node["config"]["code"], "input": {**obs_payload, "result": obs_payload}},
            base=base,
        )
        ok &= must_ok(
            "工具栏沙箱 plan",
            plan_res.get("error") in (None, "") and (plan_res.get("result") or {}).get("action") == "write_result",
            json.dumps(plan_res, ensure_ascii=False)[:200],
        )
        plan_payload = plan_res.get("result") or {}
        _, act_res = api(
            "POST",
            "/api/v1/flow/execute-code",
            {"code": act_node["config"]["code"], "input": {"result": plan_payload, **plan_payload}},
            base=base,
        )
        ok &= must_ok(
            "工具栏沙箱 act",
            (act_res.get("result") or {}).get("acted") is True,
            json.dumps(act_res, ensure_ascii=False)[:200],
        )
        act_payload = act_res.get("result") or {}
        _, ver_res = api(
            "POST",
            "/api/v1/flow/execute-code",
            {"code": verify_node["config"]["code"], "input": {"result": act_payload, **act_payload}},
            base=base,
        )
        ok &= must_ok(
            "工具栏沙箱 verify≈底部语义",
            (ver_res.get("result") or {}).get("status") == "completed",
            json.dumps(ver_res, ensure_ascii=False)[:200],
        )
    except Exception as exc:
        ok &= must_ok("工具栏沙箱链路", False, str(exc))

    print()
    if ok:
        print("[OK] Studio 双预览脚本项全绿")
        print("仍需人手点一次：意图应用画布 → 底部聊天发一句 → 工具栏点预览")
        return 0
    print("[FAIL] studio_preview_smoke 未通过 — 见 docs/HAPPY_PATH_ACCEPTANCE.md")
    return 1


if __name__ == "__main__":
    sys.exit(main())
