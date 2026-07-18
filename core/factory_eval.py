"""出厂 Eval 报告读写 — factory_gate 产物。"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from fangyu.core.config import DATA_DIR, PROJECT_ROOT


def eval_report_path(*, data_dir: Path | None = None) -> Path:
    d = Path(data_dir) if data_dir is not None else Path(DATA_DIR)
    return d / "factory_eval_report.json"


def workspace_eval_report_path() -> Path:
    return Path(PROJECT_ROOT) / ".fangyu" / "factory_eval_report.json"


def write_eval_report(
    report: dict[str, Any],
    *,
    data_dir: Path | None = None,
    also_workspace: bool = True,
) -> Path:
    """写入 DATA_DIR 报告；可选同步到仓库 `.fangyu/`。"""
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
