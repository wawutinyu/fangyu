#!/usr/bin/env python3
"""工厂出厂质检门禁（Factory Gate）。

阶段：
  unit   — 原料/harness/工厂相关单测（无 Key 必跑）
  card   — 抽样导出 Bundle，校验 Agent Card / materials
  live   — 有 API Key 时跑 harness live（可选）

退出码：
  0 全绿（跳过的 live 不算失败）
  1 有失败
  2 仅 live 被跳过且 unit+card 绿（可用 --strict-live 打成 1）

用法（仓库根）：
  python scripts/factory_gate.py
  python scripts/factory_gate.py --skip-live
  python scripts/factory_gate.py --strict-live
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


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


def stage_unit() -> bool:
    print("==> stage: unit")
    tests = [
        "tests/unit/test_materials.py",
        "tests/unit/test_plan_shell_skills.py",
        "tests/unit/test_subagent_task.py",
        "tests/unit/test_agent_loop.py",
        "tests/unit/test_bundle_tools.py",
        "tests/integration/test_opencode_factory.py",
        "tests/unit/test_factory_gate.py",
    ]
    existing = [t for t in tests if (ROOT / t).is_file()]
    code, out = _run([
        sys.executable, "-m", "pytest", *existing, "-q", "--tb=line",
    ])
    # 末几行摘要
    tail = "\n".join(out.strip().splitlines()[-8:])
    return _ok("unit pytest", code == 0, tail.replace("\n", " | ")[:240])


def stage_card() -> bool:
    print("==> stage: card / materials export")
    from fangyu.core.agent_card import validate_agent_card
    from fangyu.core.agent_factory import build_from_profile
    from fangyu.core.materials import load_materials

    tmp = Path(tempfile.mkdtemp(prefix="fangyu-gate-"))
    try:
        root = build_from_profile("opencode", tmp / "oc", name="Gate-OC")
        card_path = root / "agent.card.json"
        card = json.loads(card_path.read_text(encoding="utf-8"))
        issues = validate_agent_card(card)
        ok_card = _ok("agent card schema", not issues, "; ".join(issues)[:200])

        mat = load_materials(root)
        ok_mat = _ok(
            "materials.json",
            bool(mat.get("tools")) and (root / "config" / "materials.json").is_file(),
            f"tools={len(mat.get('tools') or [])}",
        )

        well = root / ".well-known" / "agent-card.json"
        ok_well = _ok("well-known agent-card", well.is_file(), str(well.relative_to(root)))

        tb = json.loads((root / "config" / "toolbelt.json").read_text(encoding="utf-8"))
        ok_tb = _ok("toolbelt has webfetch+task", "webfetch" in tb.get("tools", []) and "task" in tb.get("tools", []))
        return ok_card and ok_mat and ok_well and ok_tb
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def stage_live() -> tuple[bool, bool]:
    """返回 (passed_or_skipped_ok, skipped)."""
    print("==> stage: live")
    try:
        from fangyu.core.credentials import ensure_api_keys
        has_key = ensure_api_keys()
    except Exception:
        has_key = False
    if not has_key:
        print("[SKIP] live — 无 API Key（.env / Studio DB）")
        return True, True

    scripts = [
        "scripts/opencode_harness_live.py",
        "scripts/task_harness_live.py",
    ]
    ok = True
    for rel in scripts:
        path = ROOT / rel
        if not path.is_file():
            ok = _ok(rel, False, "missing") and ok
            continue
        code, out = _run([sys.executable, str(path)], cwd=ROOT)
        tail = ""
        for line in reversed(out.strip().splitlines()):
            if line.strip():
                tail = line.strip()[:160]
                break
        ok = _ok(rel, code == 0, tail) and ok
    return ok, False


def main() -> int:
    parser = argparse.ArgumentParser(description="fangyu factory gate")
    parser.add_argument("--skip-live", action="store_true", help="跳过 live 阶段")
    parser.add_argument("--strict-live", action="store_true", help="无 Key 跳过 live 时仍返回失败")
    parser.add_argument("--unit-only", action="store_true", help="只跑 unit")
    args = parser.parse_args()

    print(f"factory gate @ {ROOT}")
    failed = False
    live_skipped = False

    if not stage_unit():
        failed = True
    if args.unit_only:
        return 1 if failed else 0

    if not stage_card():
        failed = True

    if not args.skip_live:
        live_ok, live_skipped = stage_live()
        if not live_ok:
            failed = True
        if live_skipped and args.strict_live:
            failed = True
            print("[FAIL] --strict-live：live 被跳过视为失败")

    print()
    if failed:
        print("[FAIL] 出厂门禁未过")
        return 1
    if args.skip_live:
        print("[OK] 出厂门禁通过（--skip-live，未跑 live）")
        return 0
    if live_skipped:
        print("[OK] 出厂门禁通过（live 跳过）")
        return 2
    print("[OK] 出厂门禁全绿")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
