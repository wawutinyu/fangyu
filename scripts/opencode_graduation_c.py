#!/usr/bin/env python3
"""毕业路径 C — 尽可能自动打勾（无 Key 用 mock；有 Key 再跑 live）。

覆盖：
  C1 create + workspace（临时 git 仓）
  C2 chat 真写文件（mock LLM）
  C3 chat.jsonl 会话
  C4 live 三用例（有 Key 才跑，否则 SKIP）
  C5 危险 shell 被拒（直接 tool + mock 提示）
  C6 再 create 一个变体包仍可 chat

退出码：0 全部应测项通过；1 有 FAIL；2 仅因无 Key 跳过 C4（其余绿时仍返回 0，并打印提示）
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except Exception:
    pass

from fangyu.core.credentials import ensure_api_keys  # noqa: E402


def _has_key() -> bool:
    return ensure_api_keys()


def _mark(ok: bool | None, label: str, detail: str = "") -> bool | None:
    if ok is None:
        tag = "SKIP"
    elif ok:
        tag = "OK"
    else:
        tag = "FAIL"
    print(f"[{tag}] {label}" + (f" — {detail}" if detail else ""))
    return ok


def main() -> int:
    from fangyu.core.agent_factory import build_from_profile
    from fangyu.engine.bundle_chat import chat_once
    from fangyu.engine.bundle_session import load_chat
    from fangyu.engine.bundle_tools import tool_shell
    from fangyu.engine.workspace import init_bundle_workspace

    tmp = Path(tempfile.mkdtemp(prefix="fangyu-grad-c-"))
    repo = tmp / "repo"
    b1 = tmp / "bundle-a"
    b2 = tmp / "bundle-b"
    repo.mkdir()
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    (repo / "README.md").write_text("# demo\n", encoding="utf-8")

    print(f"==> graduation C @ {tmp}")
    results: list[bool | None] = []

    # C1
    try:
        build_from_profile("opencode", b1, name="Grad-A", workspace=repo)
        cfg = json.loads((b1 / "config" / "workspace.json").read_text(encoding="utf-8"))
        results.append(_mark(
            Path(cfg["path"]) == repo.resolve() and (repo / ".git").is_dir(),
            "C1 create + workspace → git 仓",
        ))
    except Exception as exc:
        results.append(_mark(False, "C1 create + workspace → git 仓", str(exc)))

    # C2 + C3 — mock 须先 plan（opencode require_plan=True）
    replies = [
        '{"action":"plan","steps":["write GRAD_NOTE.md","done"]}',
        '{"action":"tool","name":"write","args":{"path":"GRAD_NOTE.md","content":"# graduated\\n"}}',
        '{"action":"done","result":"wrote GRAD_NOTE.md"}',
    ]
    idx = {"i": 0}

    async def fake_llm(_m):
        i = idx["i"]
        idx["i"] = min(i + 1, len(replies) - 1)
        return replies[i]

    try:
        out = chat_once(b1, "add GRAD_NOTE.md", workspace=repo, llm=fake_llm)
        note = repo / "GRAD_NOTE.md"
        hist = load_chat()
        c2 = bool(out.get("success")) and note.is_file() and "graduated" in note.read_text(encoding="utf-8")
        results.append(_mark(c2, "C2 chat 写出真实改动", (out.get("error") or "")[:120]))
        c3 = len(hist) >= 2 and hist[-1].get("role") == "assistant"
        results.append(_mark(c3, "C3 chat.jsonl 有会话", f"n={len(hist)} path={repo / '.fangyu' / 'chat.jsonl'}"))
        # git sees change
        diff = subprocess.run(["git", "status", "--porcelain"], cwd=repo, capture_output=True, text=True)
        results.append(_mark(
            "GRAD_NOTE.md" in (diff.stdout or ""),
            "C2b git status 可见改动",
            (diff.stdout or "").strip()[:80],
        ))
    except Exception as exc:
        results.append(_mark(False, "C2/C3 chat+session", str(exc)))

    # C5 dangerous shell
    try:
        init_bundle_workspace(b1, workspace_override=repo)
        denied = False
        try:
            tool_shell(command="sudo rm -rf /")
        except PermissionError:
            denied = True
        results.append(_mark(denied, "C5 危险 shell 被拒"))
    except Exception as exc:
        results.append(_mark(False, "C5 危险 shell 被拒", str(exc)))

    # C6 second bundle
    try:
        build_from_profile("opencode", b2, name="Grad-B", workspace=repo)
        idx["i"] = 0
        replies2 = [
            '{"action":"plan","steps":["write VARIANT.txt"]}',
            '{"action":"tool","name":"write","args":{"path":"VARIANT.txt","content":"b"}}',
            '{"action":"done","result":"ok"}',
        ]

        async def fake2(_m):
            i = idx["i"]
            idx["i"] = min(i + 1, len(replies2) - 1)
            return replies2[i]

        out2 = chat_once(b2, "write VARIANT", workspace=repo, llm=fake2)
        results.append(_mark(
            bool(out2.get("success")) and (repo / "VARIANT.txt").is_file(),
            "C6 变体包仍可 chat",
        ))
    except Exception as exc:
        results.append(_mark(False, "C6 变体包仍可 chat", str(exc)))

    # C4 live
    if _has_key():
        print("-- C4 live --")
        live = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "opencode_harness_live.py")],
            cwd=ROOT,
        )
        results.append(_mark(live.returncode == 0, "C4 live 三用例", f"exit={live.returncode}"))
    else:
        results.append(_mark(None, "C4 live 三用例", "无 API Key — 配置后: python scripts/opencode_harness_live.py"))

    print()
    fails = sum(1 for r in results if r is False)
    skips = sum(1 for r in results if r is None)
    if fails:
        print(f"[FAIL] 毕业 C 自动项未过（fail={fails}, skip={skips}）")
        code = 1
    else:
        print(f"[OK] 毕业 C 可自动项全绿（skip={skips}）")
        if skips:
            print("人手剩余：配置 API Key 跑 C4 live，并在真实业务仓再 chat 一次。")
        else:
            print("OpenCode 本机毕业清单可视为通过（含 live）。")
        code = 0

    shutil.rmtree(tmp, ignore_errors=True)
    return code


if __name__ == "__main__":
    sys.exit(main())
