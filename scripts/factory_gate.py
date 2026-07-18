#!/usr/bin/env python3
"""工厂出厂质检门禁（Factory Gate）。

阶段：
  unit   — 原料/harness/工厂相关单测（无 Key 必跑）
  card   — 抽样导出 Bundle，校验 Agent Card / materials / eval 断言
  live   — 有 API Key 时跑 harness live（可选）

退出码：
  0 全绿（跳过的 live 不算失败）
  1 有失败
  2 仅 live 被跳过且 unit+card 绿（可用 --strict-live 打成 1）

产物：
  DATA_DIR/factory_eval_report.json
  （同步）仓库 .fangyu/factory_eval_report.json

用法（仓库根）：
  python scripts/factory_gate.py
  python scripts/factory_gate.py --skip-live
  python scripts/factory_gate.py --live-tier smoke
  python scripts/factory_gate.py --live-tier full --strict-live

文档：docs/FACTORY_EVAL.md
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

LIVE_TIER_SCRIPTS: dict[str, list[str]] = {
    "none": [],
    "smoke": [
        "scripts/cross_factory_harness_live.py",
        "scripts/opencode_harness_live.py",
    ],
    "full": [
        "scripts/cross_factory_harness_live.py",
        "scripts/opencode_harness_live.py",
        "scripts/task_harness_live.py",
        "scripts/workbuddy_harness_live.py",
    ],
}

# 无 API Key 也可跑的 live（跨厂 RPC 等）
KEY_FREE_LIVE: set[str] = {
    "scripts/cross_factory_harness_live.py",
}

# 固定回归集（与 docs/FACTORY_EVAL.md 对齐）
UNIT_SUITE = [
    "tests/unit/test_materials.py",
    "tests/unit/test_materials_shelf.py",
    "tests/unit/test_plan_shell_skills.py",
    "tests/unit/test_subagent_task.py",
    "tests/unit/test_agent_loop.py",
    "tests/unit/test_bundle_tools.py",
    "tests/unit/test_skills_topology_trace.py",
    "tests/unit/test_g2_workbuddy_multi.py",
    "tests/unit/test_approvals.py",
    "tests/unit/test_mcp_tasks.py",
    "tests/unit/test_mcp_http_presence.py",
    "tests/unit/test_browser_sso.py",
    "tests/unit/test_factory_eval_suite.py",
    "tests/unit/test_org_acl.py",
    "tests/unit/test_acl_sso_bridge.py",
    "tests/unit/test_monitor_eval.py",
    "tests/unit/test_a2a_discovery_constitution.py",
    "tests/unit/test_managed_eval_trend.py",
    "tests/unit/test_im_wizard.py",
    "tests/unit/test_presence_samples.py",
    "tests/unit/test_eval_alert_presence.py",
    "tests/unit/test_external_acl_defaults.py",
    "tests/unit/test_monitor_alert_kinds.py",
    "tests/unit/test_monitor_alerts_ping.py",
    "tests/unit/test_a2a_factory_health.py",
    "tests/unit/test_factories_health_eval.py",
    "tests/unit/test_collaboration.py",
    "tests/integration/test_opencode_factory.py",
    "tests/unit/test_factory_gate.py",
]

REQUIRED_SKILLS = {
    "implement-and-verify",
    "explore-codebase",
    "research-web",
    "office-decompose",
    "multi-agent-split",
    "browser-inspect",
}


def _run(cmd: list[str], *, cwd: Path | None = None) -> tuple[int, str]:
    p = subprocess.run(
        cmd,
        cwd=str(cwd or ROOT),
        capture_output=True,
        text=True,
    )
    out = (p.stdout or "") + (p.stderr or "")
    return p.returncode, out


def _ok(label: str, cond: bool, detail: str = "") -> bool:
    mark = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"[{mark}] {label}{suffix}")
    return cond


def stage_unit() -> dict[str, Any]:
    print("==> stage: unit")
    existing = [t for t in UNIT_SUITE if (ROOT / t).is_file()]
    missing = [t for t in UNIT_SUITE if not (ROOT / t).is_file()]
    if missing:
        print(f"[WARN] suite files missing: {missing}")
    code, out = _run([
        sys.executable, "-m", "pytest", *existing, "-q", "--tb=line",
    ])
    tail = "\n".join(out.strip().splitlines()[-8:])
    ok = _ok("unit pytest", code == 0, tail.replace("\n", " | ")[:240])
    return {
        "ok": ok,
        "exit_code": code,
        "files": existing,
        "missing": missing,
        "detail": tail[:500],
    }


def stage_card() -> dict[str, Any]:
    print("==> stage: card / materials export")
    from fangyu.core.agent_card import validate_agent_card
    from fangyu.core.agent_factory import build_from_profile
    from fangyu.core.materials import default_materials, load_materials
    from fangyu.core.skill_pack import list_factory_skill_ids, load_skill_parsed
    from fangyu.core.sso import public_auth_config
    from fangyu.core.topology_export import load_topology, normalize_pipeline_stages

    checks: list[dict[str, Any]] = []
    tmp = Path(tempfile.mkdtemp(prefix="fangyu-gate-"))
    try:
        root = build_from_profile("opencode", tmp / "oc", name="Gate-OC")
        card_path = root / "agent.card.json"
        card = json.loads(card_path.read_text(encoding="utf-8"))
        issues = validate_agent_card(card)
        ok_card = _ok("agent card schema", not issues, "; ".join(issues)[:200])
        checks.append({"id": "agent_card", "ok": ok_card})

        mat = load_materials(root)
        ok_mat = _ok(
            "materials.json",
            bool(mat.get("tools")) and (root / "config" / "materials.json").is_file(),
            f"tools={len(mat.get('tools') or [])}",
        )
        checks.append({"id": "materials", "ok": ok_mat, "tools": len(mat.get("tools") or [])})

        well = root / ".well-known" / "agent-card.json"
        ok_well = _ok("well-known agent-card", well.is_file(), str(well.relative_to(root)))
        checks.append({"id": "well_known", "ok": ok_well})

        tb = json.loads((root / "config" / "toolbelt.json").read_text(encoding="utf-8"))
        ok_tb = _ok(
            "toolbelt has webfetch+task",
            "webfetch" in tb.get("tools", []) and "task" in tb.get("tools", []),
        )
        checks.append({"id": "toolbelt", "ok": ok_tb})

        skill_ids = list_factory_skill_ids()
        missing = sorted(REQUIRED_SKILLS - set(skill_ids))
        ok_skills = _ok("factory skill packs", not missing, ",".join(missing) or f"n={len(skill_ids)}")
        for sid in REQUIRED_SKILLS:
            if sid in skill_ids and not load_skill_parsed(sid):
                ok_skills = _ok(f"skill parse {sid}", False) and ok_skills
        checks.append({"id": "skills", "ok": ok_skills, "count": len(skill_ids)})

        plat = default_materials()
        tool_ids = {t["id"] for t in (plat.get("tools") or []) if isinstance(t, dict)}
        ok_browser = _ok(
            "platform materials browser tools",
            {"browser_open", "browser_wait", "browser_screenshot"} <= tool_ids,
        )
        checks.append({"id": "browser_tools", "ok": ok_browser})

        auth = public_auth_config()
        ok_auth = _ok(
            "auth modes oidc",
            "oidc_auth_code" in (auth.get("modes") or [])
            and "oidc_jwks_rs256" in (auth.get("modes") or []),
        )
        checks.append({"id": "auth_modes", "ok": ok_auth})

        multi = build_from_profile(
            "multi", tmp / "multi", intent="搜索分析汇总竞品报告", name="Gate-Multi",
        )
        topo = load_topology(multi)
        stages = normalize_pipeline_stages(topo)
        ok_topo = _ok(
            "multi topology depends schedule",
            len(stages) >= 2 and all(isinstance(s, list) and s for s in stages),
            f"stages={stages}",
        )
        checks.append({"id": "topology_stages", "ok": ok_topo, "stages": stages})
        has_dep = any(
            (e.get("type") or e.get("label")) == "depends"
            for e in (topo.get("edges") or [])
        )
        ok_dep = _ok("topology has depends edges", has_dep)
        checks.append({"id": "topology_depends", "ok": ok_dep})

        from fangyu.engine import harness_trace as ht

        ws = tmp / "trace-ws"
        ws.mkdir(parents=True, exist_ok=True)
        orig_resolve = ht.resolve_trace_path

        def _resolve(**kwargs):
            return ws / ".fangyu" / "harness_trace.jsonl"

        ht.resolve_trace_path = _resolve  # type: ignore
        try:
            path = ht.append_harness_trace({"type": "gate_smoke", "ok": True})
            rows = ht.read_traces(path, limit=5) if path else []
            ok_trace = _ok(
                "harness_trace append",
                bool(path and path.is_file() and rows),
                str(path) if path else "none",
            )
        finally:
            ht.resolve_trace_path = orig_resolve  # type: ignore
        checks.append({"id": "harness_trace", "ok": ok_trace})

        from fangyu.core.presence_samples import list_sample_meta, load_sample_pack

        samples = list_sample_meta()
        ok_samples = _ok(
            "presence replay samples",
            any(s.get("id") == "cross-host" for s in samples),
            f"n={len(samples)}",
        )
        checks.append({"id": "presence_samples", "ok": ok_samples, "count": len(samples)})
        if ok_samples:
            pack = load_sample_pack("cross-host")
            kinds = {e.get("kind") for e in (pack.get("events") or [])}
            ok_xh = _ok(
                "cross-host sample events",
                "host.heartbeat" in kinds and "managed.start" in kinds,
                f"kinds={len(kinds)}",
            )
            checks.append({"id": "cross_host_sample", "ok": ok_xh})
            try:
                cft = load_sample_pack("cross-factory-task")
                ck = {e.get("kind") for e in (cft.get("events") or [])}
                ok_cft = _ok(
                    "cross-factory-task sample",
                    "a2a.send" in ck and "a2a.complete" in ck,
                    f"kinds={len(ck)}",
                )
            except FileNotFoundError:
                ok_cft = _ok("cross-factory-task sample", False, "missing")
            checks.append({"id": "cross_factory_task_sample", "ok": ok_cft})

        ok = all(c.get("ok") for c in checks)
        return {"ok": ok, "checks": checks}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def resolve_live_tier(args: argparse.Namespace) -> str:
    if args.skip_live or args.live_tier == "none":
        return "none"
    if args.live_tier:
        return str(args.live_tier)
    return "full"


def stage_live(*, tier: str = "full") -> dict[str, Any]:
    """返回 live 阶段结果。tier: none | smoke | full

    key-free 脚本（跨厂 RPC）即使无 API Key 也会跑；LLM harness 仍需 Key。
    """
    print(f"==> stage: live (tier={tier})")
    if tier == "none":
        print("[SKIP] live — tier=none")
        return {"ok": True, "skipped": True, "tier": tier, "scripts": [], "reason": "tier-none"}

    try:
        from fangyu.core.credentials import ensure_api_keys
        has_key = ensure_api_keys()
    except Exception:
        has_key = False

    all_scripts = list(LIVE_TIER_SCRIPTS.get(tier) or LIVE_TIER_SCRIPTS["full"])
    key_free = [s for s in all_scripts if s in KEY_FREE_LIVE]
    key_gated = [s for s in all_scripts if s not in KEY_FREE_LIVE]

    scripts: list[str] = list(key_free)
    if has_key:
        scripts.extend(key_gated)
    elif key_gated:
        print(f"[SKIP] live LLM — 无 API Key（跳过 {len(key_gated)} 个 harness）")

    if not scripts:
        print("[SKIP] live — 无可跑脚本（无 Key 且无 key-free）")
        return {"ok": True, "skipped": True, "tier": tier, "scripts": [], "reason": "no-key"}

    results: list[dict[str, Any]] = []
    ok = True
    any_ran = False
    all_skipped = True
    for rel in scripts:
        path = ROOT / rel
        if not path.is_file():
            ok = _ok(rel, False, "missing") and ok
            results.append({"script": rel, "ok": False, "detail": "missing"})
            all_skipped = False
            continue
        code, out = _run([sys.executable, str(path)], cwd=ROOT)
        tail = ""
        for line in reversed(out.strip().splitlines()):
            if line.strip():
                tail = line.strip()[:160]
                break
        if code == 2:
            print(f"[SKIP] {rel} — {tail or 'skipped'}")
            results.append({"script": rel, "ok": True, "skipped": True, "exit_code": 2, "detail": tail})
            continue
        any_ran = True
        all_skipped = False
        passed = code == 0
        ok = _ok(rel, passed, tail) and ok
        results.append({"script": rel, "ok": passed, "exit_code": code, "detail": tail})

    # 仅当全部被 skip（exit 2）且无失败时视为 skipped；有 key-free 跑通则 skipped=False
    skipped = all_skipped and not any_ran and ok
    if skipped:
        print("[SKIP] live — 全部脚本跳过")
    return {"ok": ok, "skipped": skipped, "tier": tier, "scripts": results, "has_key": has_key}


def main() -> int:
    parser = argparse.ArgumentParser(description="fangyu factory gate")
    parser.add_argument("--skip-live", action="store_true", help="跳过 live（等价 --live-tier none）")
    parser.add_argument(
        "--live-tier",
        choices=["none", "smoke", "full"],
        default=None,
        help="live 档：none / smoke(仅 opencode) / full(全部 harness)",
    )
    parser.add_argument("--strict-live", action="store_true", help="无 Key 跳过 live 时仍返回失败")
    parser.add_argument("--unit-only", action="store_true", help="只跑 unit")
    parser.add_argument("--no-report", action="store_true", help="不写 Eval 报告文件")
    args = parser.parse_args()

    print(f"factory gate @ {ROOT}")
    stages: dict[str, Any] = {}
    failed = False
    live_skipped = False
    live_tier = resolve_live_tier(args)

    unit = stage_unit()
    stages["unit"] = unit
    if not unit.get("ok"):
        failed = True
    if args.unit_only:
        exit_code = 1 if failed else 0
        _emit_report(stages, exit_code, args, live_skipped=False, live_tier=live_tier)
        return exit_code

    card = stage_card()
    stages["card"] = card
    if not card.get("ok"):
        failed = True

    live = stage_live(tier=live_tier)
    stages["live"] = live
    live_skipped = bool(live.get("skipped"))
    if not live.get("ok"):
        failed = True
    if live_skipped and args.strict_live:
        failed = True
        print("[FAIL] --strict-live：live 被跳过视为失败")

    print()
    if failed:
        print("[FAIL] 出厂门禁未过")
        exit_code = 1
    elif live_tier == "none":
        print("[OK] 出厂门禁通过（live-tier=none）")
        exit_code = 0
    elif live_skipped:
        print(f"[OK] 出厂门禁通过（live 跳过，tier={live_tier}）")
        exit_code = 2
    else:
        print(f"[OK] 出厂门禁全绿（live-tier={live_tier}）")
        exit_code = 0

    _emit_report(stages, exit_code, args, live_skipped=live_skipped, live_tier=live_tier)
    return exit_code


def _emit_report(
    stages: dict[str, Any],
    exit_code: int,
    args: argparse.Namespace,
    *,
    live_skipped: bool,
    live_tier: str = "full",
) -> None:
    if args.no_report:
        return
    try:
        from fangyu.core.a2a_factories import collect_factories_health_snapshot
        from fangyu.core.factory_eval import write_eval_report

        factories_health = None
        try:
            factories_health = collect_factories_health_snapshot()
        except Exception:
            factories_health = None

        path = write_eval_report({
            "exit_code": exit_code,
            "ok": exit_code in (0, 2),
            "skip_live": bool(args.skip_live) or live_tier == "none",
            "live_tier": live_tier,
            "strict_live": bool(args.strict_live),
            "unit_only": bool(args.unit_only),
            "live_skipped": live_skipped,
            "suite": list(UNIT_SUITE),
            "required_skills": sorted(REQUIRED_SKILLS),
            "stages": stages,
            **({"factories_health": factories_health} if factories_health is not None else {}),
        })
        print(f"[report] {path}")
    except Exception as exc:
        print(f"[WARN] eval report write failed: {exc}")


if __name__ == "__main__":
    raise SystemExit(main())
