#!/usr/bin/env python3
"""Live：task explore → 父 Agent 再写文件（真 LLM）。

退出码：0 绿 / 1 失败 / 2 无 Key
"""
from __future__ import annotations

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

from fangyu.core.credentials import ensure_api_keys  # noqa: E402


def main() -> int:
    if not ensure_api_keys():
        print("[SKIP] 无 API Key")
        return 2

    from fangyu.core.agent_factory import build_from_profile
    from fangyu.engine.bundle_chat import chat_once

    tmp = Path(tempfile.mkdtemp(prefix="fangyu-task-live-"))
    repo = tmp / "repo"
    bundle = tmp / "bundle"
    repo.mkdir(parents=True)
    (repo / "secret_note.txt").write_text("TOKEN=fangyu-task-live\n", encoding="utf-8")

    print(f"==> task live @ {tmp}")
    build_from_profile("opencode", bundle, name="TaskLive", workspace=repo, max_turns=20)

    r = chat_once(
        bundle,
        (
            "多步任务：1) 必须用 task 工具，subagent_type=explore，"
            "让子 Agent 找到 secret_note.txt 并读出内容；"
            "2) 你自己用 write 创建 found.md，写入一行恰好：found=fangyu-task-live；"
            "3) done。先 plan 再执行。"
        ),
        workspace=repo,
    )
    ok = bool(r.get("success"))
    found = repo / "found.md"
    text = found.read_text(encoding="utf-8") if found.is_file() else ""
    hit = "fangyu-task-live" in text
    # trace 里应出现 task
    outs = str(r.get("outputs") or r)
    used_task = "task" in outs or "explore" in outs

    print(f"[{'OK' if ok else 'FAIL'}] success={ok}")
    print(f"[{'OK' if hit else 'FAIL'}] found.md — {text!r}")
    print(f"[{'OK' if used_task else 'WARN'}] outputs mention task/explore")

    shutil.rmtree(tmp, ignore_errors=True)
    if ok and hit:
        print("\n[OK] task live 通过")
        return 0
    print("\n[FAIL] task live 未过")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
