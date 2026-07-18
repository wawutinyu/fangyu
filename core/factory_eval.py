"""出厂 Eval 报告读写 — factory_gate 产物 + 历史趋势。"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from fangyu.core.config import DATA_DIR, PROJECT_ROOT


def eval_report_path(*, data_dir: Path | None = None) -> Path:
    d = Path(data_dir) if data_dir is not None else Path(DATA_DIR)
    return d / "factory_eval_report.json"


def eval_history_path(*, data_dir: Path | None = None) -> Path:
    d = Path(data_dir) if data_dir is not None else Path(DATA_DIR)
    return d / "factory_eval_history.jsonl"


def workspace_eval_report_path() -> Path:
    return Path(PROJECT_ROOT) / ".fangyu" / "factory_eval_report.json"


def _stage_digest(stages: dict[str, Any] | None) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for name, st in (stages or {}).items():
        if not isinstance(st, dict):
            continue
        out[name] = {
            "ok": bool(st.get("ok")),
            "skipped": bool(st.get("skipped")),
        }
        checks = st.get("checks")
        if isinstance(checks, list):
            out[name]["checks_ok"] = sum(1 for c in checks if isinstance(c, dict) and c.get("ok"))
            out[name]["checks_total"] = len(checks)
        scripts = st.get("scripts")
        if isinstance(scripts, list):
            out[name]["scripts_ok"] = sum(1 for s in scripts if isinstance(s, dict) and s.get("ok"))
            out[name]["scripts_total"] = len(scripts)
    return out


def summarize_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "ts": report.get("ts"),
        "exit_code": report.get("exit_code"),
        "ok": bool(report.get("ok")),
        "live_skipped": bool(report.get("live_skipped")),
        "skip_live": bool(report.get("skip_live")),
        "stages": _stage_digest(report.get("stages") if isinstance(report.get("stages"), dict) else {}),
    }


def append_eval_history(
    report: dict[str, Any],
    *,
    data_dir: Path | None = None,
    keep: int = 50,
) -> Path:
    """追加精简历史行；超出 keep 时截断头部。"""
    path = eval_history_path(data_dir=data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    row = summarize_report(report)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")
    # 截断
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
        if len(lines) > max(10, int(keep)):
            path.write_text("\n".join(lines[-keep:]) + "\n", encoding="utf-8")
    except OSError:
        pass
    return path


def write_eval_report(
    report: dict[str, Any],
    *,
    data_dir: Path | None = None,
    also_workspace: bool = True,
    history: bool = True,
) -> Path:
    """写入 DATA_DIR 报告；可选同步到仓库 `.fangyu/` 并追加历史。"""
    doc = {
        "version": 1,
        "ts": time.time(),
        **report,
    }
    path = eval_report_path(data_dir=data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    if also_workspace:
        alt = workspace_eval_report_path()
        try:
            alt.parent.mkdir(parents=True, exist_ok=True)
            alt.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError:
            pass
    if history:
        try:
            append_eval_history(doc, data_dir=data_dir)
        except OSError:
            pass
    return path


def load_eval_report(*, data_dir: Path | None = None) -> dict[str, Any] | None:
    path = eval_report_path(data_dir=data_dir)
    if not path.is_file():
        # 回退仓库产物
        alt = workspace_eval_report_path()
        path = alt if alt.is_file() else path
    if not path.is_file():
        return None
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    return doc if isinstance(doc, dict) else None


def load_eval_history(*, data_dir: Path | None = None, limit: int = 20) -> list[dict[str, Any]]:
    path = eval_history_path(data_dir=data_dir)
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    for line in lines[-max(1, int(limit)) :]:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    rows.reverse()  # 新的在前
    return rows


def compare_eval_reports(
    current: dict[str, Any] | None,
    previous: dict[str, Any] | None,
) -> dict[str, Any]:
    """对比两份（完整报告或历史摘要）。"""
    a = summarize_report(current) if current else None
    b = summarize_report(previous) if previous else None
    if not a:
        return {"ok": False, "error": "no current report"}
    if not b:
        return {
            "ok": True,
            "changed": False,
            "current": a,
            "previous": None,
            "stage_diffs": [],
            "exit_changed": False,
        }
    stage_diffs: list[dict[str, Any]] = []
    stages_a = a.get("stages") or {}
    stages_b = b.get("stages") or {}
    names = sorted(set(stages_a) | set(stages_b))
    for name in names:
        sa = stages_a.get(name) or {}
        sb = stages_b.get(name) or {}
        if sa.get("ok") != sb.get("ok") or sa.get("skipped") != sb.get("skipped"):
            stage_diffs.append({
                "stage": name,
                "from": {"ok": sb.get("ok"), "skipped": sb.get("skipped")},
                "to": {"ok": sa.get("ok"), "skipped": sa.get("skipped")},
            })
    return {
        "ok": True,
        "changed": bool(stage_diffs) or a.get("exit_code") != b.get("exit_code") or a.get("ok") != b.get("ok"),
        "exit_changed": a.get("exit_code") != b.get("exit_code"),
        "current": a,
        "previous": b,
        "stage_diffs": stage_diffs,
    }


def eval_trend(*, data_dir: Path | None = None, limit: int = 10) -> dict[str, Any]:
    hist = load_eval_history(data_dir=data_dir, limit=limit)
    # hist 新→旧；趋势点按时间正序
    points = list(reversed(hist))
    streak = 0
    for row in hist:
        if row.get("ok"):
            streak += 1
        else:
            break
    last_fail = next((r for r in hist if not r.get("ok")), None)
    latest = hist[0] if hist else load_eval_report(data_dir=data_dir)
    prev = hist[1] if len(hist) > 1 else None
    if latest and not isinstance(latest.get("stages"), dict) and latest.get("exit_code") is not None:
        # full report from load_eval_report
        pass
    cmp = compare_eval_reports(
        hist[0] if hist else load_eval_report(data_dir=data_dir),
        hist[1] if len(hist) > 1 else None,
    )
    return {
        "points": points,
        "count": len(points),
        "ok_streak": streak,
        "last_fail": last_fail,
        "compare": cmp,
    }
