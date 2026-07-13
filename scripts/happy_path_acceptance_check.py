#!/usr/bin/env python3
"""
Happy Path 外人验收 — API 侧自动检查（步骤 6 / 8 / 9 的可脚本部分）。

前提：API 已启动。建议先：
  py scripts/worker_happy_path.py --spawn-worker

用法：
  py scripts/happy_path_acceptance_check.py
  py scripts/happy_path_acceptance_check.py --base http://127.0.0.1:8000
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:8000"


def api(method: str, path: str, body: dict | None = None, base: str = DEFAULT_BASE):
    url = f"{base.rstrip('/')}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def must_ok(name: str, cond: bool, detail: str = "") -> bool:
    mark = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"[{mark}] {name}{suffix}")
    return cond


def main() -> int:
    parser = argparse.ArgumentParser(description="Happy Path API acceptance checks")
    parser.add_argument("--base", default=DEFAULT_BASE)
    args = parser.parse_args()
    ok = True

    try:
        health = api("GET", "/api/health", base=args.base)
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"[FAIL] API 未就绪: {args.base} ({exc})")
        print("提示: 若刚 pull 过代码，先跑 dev-clean.bat 再 dev.bat，避免旧进程缺路由。")
        return 1

    ok &= must_ok("health", health.get("status") == "ok", str(health))

    # OpenAPI 必须含观/场景（旧进程最常见故障）
    try:
        openapi = api("GET", "/openapi.json", base=args.base)
        paths = set((openapi.get("paths") or {}).keys())
    except Exception as exc:
        print(f"[FAIL] openapi: {exc}")
        return 1

    for required in (
        "/api/v1/presence",
        "/api/v1/presence/stream",
        "/api/v1/scenario/templates",
        "/api/v1/intent/to-flow",
        "/api/v1/setup/copilot/preview",
        "/api/v1/constitution",
        "/api/v1/workers",
    ):
        hit = required in paths
        ok &= must_ok(f"route {required}", hit)
        if not hit:
            print("  → 像是旧 API 进程。请: dev-clean.bat && py -m fangyu --server")

    # 观
    try:
        presence = api("GET", "/api/v1/presence", base=args.base)
        workers = presence.get("presence") or []
        events = presence.get("events") or []
        online = [w for w in workers if w.get("online")]
        ok &= must_ok("观 presence 可读", isinstance(workers, list), f"online={len(online)} events={len(events)}")
    except Exception as exc:
        ok &= must_ok("观 presence 可读", False, str(exc))

    # 律
    try:
        constitution = api("GET", "/api/v1/constitution", base=args.base)
        ok &= must_ok("律 constitution", bool(constitution), f"version={constitution.get('version')}")
        verify = api("GET", "/api/v1/constitution/audit/verify?limit=200", base=args.base)
        ok &= must_ok(
            "律 audit verify",
            verify.get("valid") is True,
            json.dumps(verify, ensure_ascii=False),
        )
    except Exception as exc:
        ok &= must_ok("律 API", False, str(exc))

    # 场景模板
    try:
        scenarios = api("GET", "/api/v1/scenario/templates", base=args.base)
        items = scenarios.get("scenarios") or scenarios.get("templates") or []
        ok &= must_ok("场景模板", len(items) >= 1, f"count={len(items)}")
    except Exception as exc:
        ok &= must_ok("场景模板", False, str(exc))

    # Workers 在线（步骤 3/6 前置）
    try:
        w = api("GET", "/api/v1/workers", base=args.base)
        online_w = [x for x in (w.get("workers") or []) if x.get("online")]
        ok &= must_ok("至少 1 个在线 Worker", len(online_w) >= 1, f"online={len(online_w)}")
    except Exception as exc:
        ok &= must_ok("Workers", False, str(exc))

    print()
    if ok:
        print("[OK] Happy Path API 验收项全绿（UI 步骤 2/4/5/8/9 仍需人手点一遍）")
        return 0
    print("[FAIL] 存在未通过项 — 见 docs/HAPPY_PATH_ACCEPTANCE.md")
    return 1


if __name__ == "__main__":
    sys.exit(main())
