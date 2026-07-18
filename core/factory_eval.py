"""出厂 Eval 报告读写 — factory_gate 产物 + 历史趋势。"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from fangyu.core import config as config_mod
from fangyu.core.config import PROJECT_ROOT


def eval_report_path(*, data_dir: Path | None = None) -> Path:
    d = Path(data_dir) if data_dir is not None else Path(config_mod.DATA_DIR)
    return d / "factory_eval_report.json"


def eval_history_path(*, data_dir: Path | None = None) -> Path:
    d = Path(data_dir) if data_dir is not None else Path(config_mod.DATA_DIR)
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
    out: dict[str, Any] = {
        "ts": report.get("ts"),
        "exit_code": report.get("exit_code"),
        "ok": bool(report.get("ok")),
        "live_skipped": bool(report.get("live_skipped")),
        "skip_live": bool(report.get("skip_live")),
        "stages": _stage_digest(report.get("stages") if isinstance(report.get("stages"), dict) else {}),
    }
    fh = report.get("factories_health")
    if isinstance(fh, dict):
        out["factories_health"] = {
            "count": fh.get("count"),
            "online": fh.get("online"),
            "offline": fh.get("offline"),
            "avg_score": fh.get("avg_score"),
            "min_score": fh.get("min_score"),
        }
    return out


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
    emit_presence: bool = True,
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
    if emit_presence:
        try:
            emit_eval_presence_event(doc, data_dir=data_dir)
        except Exception:
            pass
    return path


def emit_eval_presence_event(
    report: dict[str, Any],
    *,
    data_dir: Path | None = None,
) -> dict[str, Any] | None:
    """Eval 失败 / 回归时写入协作事件，供值班墙与 monitor/alerts。"""
    from fangyu.core.collaboration import emit_event

    ok = bool(report.get("ok"))
    exit_code = int(report.get("exit_code") or 0)
    hist = load_eval_history(data_dir=data_dir, limit=3)
    # hist[0] 刚追加的当前行；对照 hist[1]
    prev = hist[1] if len(hist) > 1 else None
    cmp = compare_eval_reports(report, prev) if prev else {"changed": False, "stage_diffs": []}
    regression = bool(prev and prev.get("ok") and not ok)
    stage_fail = [
        name
        for name, st in (report.get("stages") or {}).items()
        if isinstance(st, dict) and not st.get("skipped") and st.get("ok") is False
    ]

    if ok:
        return None

    kind = "eval.regression" if regression else "eval.fail"
    failed = ", ".join(stage_fail[:6]) or "见 stages"
    message = (
        f"出厂质检{'回归' if regression else '未过'} · exit={exit_code} · {failed}"
    )
    return emit_event(
        kind,
        actor="eval:factory_gate",
        message=message,
        detail={
            "exit_code": exit_code,
            "ok": ok,
            "live_tier": report.get("live_tier"),
            "failed_stages": stage_fail,
            "stage_diffs": (cmp.get("stage_diffs") or [])[:12],
            "ts": report.get("ts"),
        },
        severity="error",
    )


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
            "factories_health_diff": None,
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

    fh_diff = _factories_health_diff(a.get("factories_health"), b.get("factories_health"))
    health_changed = bool(fh_diff and fh_diff.get("changed"))
    changed = (
        bool(stage_diffs)
        or a.get("exit_code") != b.get("exit_code")
        or a.get("ok") != b.get("ok")
        or health_changed
    )
    return {
        "ok": True,
        "changed": changed,
        "exit_changed": a.get("exit_code") != b.get("exit_code"),
        "current": a,
        "previous": b,
        "stage_diffs": stage_diffs,
        "factories_health_diff": fh_diff,
    }


def _factories_health_diff(
    left: Any,
    right: Any,
) -> dict[str, Any] | None:
    """current(left/较新) vs previous(right/对照) 的工厂健康差。"""
    la = left if isinstance(left, dict) else None
    rb = right if isinstance(right, dict) else None
    if not la and not rb:
        return None

    def _num(v: Any) -> float | None:
        if isinstance(v, (int, float)):
            return float(v)
        return None

    left_avg = _num((la or {}).get("avg_score"))
    right_avg = _num((rb or {}).get("avg_score"))
    left_off = _num((la or {}).get("offline"))
    right_off = _num((rb or {}).get("offline"))

    avg_delta = None
    if left_avg is not None and right_avg is not None:
        avg_delta = round(left_avg - right_avg, 1)
    offline_delta = None
    if left_off is not None and right_off is not None:
        offline_delta = int(left_off - right_off)

    changed = False
    if offline_delta is not None and offline_delta != 0:
        changed = True
    if avg_delta is not None and abs(avg_delta) >= 1.0:
        changed = True
    if (la is None) != (rb is None):
        changed = True

    return {
        "changed": changed,
        "avg_score_delta": avg_delta,
        "offline_delta": offline_delta,
        "left": {
            "count": (la or {}).get("count"),
            "online": (la or {}).get("online"),
            "offline": (la or {}).get("offline"),
            "avg_score": (la or {}).get("avg_score"),
            "min_score": (la or {}).get("min_score"),
        } if la else None,
        "right": {
            "count": (rb or {}).get("count"),
            "online": (rb or {}).get("online"),
            "offline": (rb or {}).get("offline"),
            "avg_score": (rb or {}).get("avg_score"),
            "min_score": (rb or {}).get("min_score"),
        } if rb else None,
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
