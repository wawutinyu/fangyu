#!/usr/bin/env python3
"""OpenCode harness live 验收（真 LLM）。

三用例（均经 bundle chat → agent-loop → workspace）：
  1) write 文件
  2) search + apply_patch
  3) shell 写文件

环境：
  DEEPSEEK_API_KEY 或 OPENAI_API_KEY（至少一个）

退出码：
  0 全绿
  1 失败
  2 跳过（无 Key）

用法（仓库根）：
  python scripts/opencode_harness_live.py
  python scripts/opencode_harness_live.py --keep
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# 与平台一致：.env 或 Studio data/fangyu.db settings
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except Exception:
    pass

from fangyu.core.credentials import ensure_api_keys  # noqa: E402


def _has_key() -> bool:
    return ensure_api_keys()


def _ok(label: str, cond: bool, detail: str = "") -> bool:
    mark = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"[{mark}] {label}{suffix}")
    return cond


def main() -> int:
    parser = argparse.ArgumentParser(description="OpenCode harness live acceptance")
    parser.add_argument("--keep", action="store_true", help="保留临时目录便于排查")
    args = parser.parse_args()

    if not _has_key():
        print("[SKIP] 未设置 API Key（.env 或 Studio 设置 data/fangyu.db）")
        print("提示: 在 Studio 设置 DeepSeek Key，或 export DEEPSEEK_API_KEY=...")
        return 2

    # live 脚本默认放行 shell，避免 ask 人审把 case3 卡死（Studio 仍默认 ask）
    os.environ.setdefault("FANGYU_SHELL_POLICY", "allow")

    from fangyu.core.agent_factory import build_from_profile
    from fangyu.engine.bundle_chat import chat_once

    tmp = Path(tempfile.mkdtemp(prefix="fangyu-live-"))
    project = tmp / "repo"
    bundle = tmp / "bundle"
    project.mkdir(parents=True)
    (project / "seed.txt").write_text("alpha REPLACE_ME omega\n", encoding="utf-8")

    print(f"==> live harness @ {tmp}")
    try:
        build_from_profile(
            "opencode",
            bundle,
            name="LiveHarness",
            workspace=project,
            max_turns=16,
        )
    except Exception as exc:
        print(f"[FAIL] create bundle: {exc}")
        if not args.keep:
            shutil.rmtree(tmp, ignore_errors=True)
        return 1

    ok = True

    # --- 1 write ---
    r1 = chat_once(
        bundle,
        (
            "用 write 工具创建文件 live_write.md，内容恰好一行：live-case-1。"
            "完成后 action=done。"
        ),
        workspace=project,
    )
    f1 = project / "live_write.md"
    ok &= _ok(
        "case1 write",
        bool(r1.get("success")) and f1.is_file() and "live-case-1" in f1.read_text(encoding="utf-8"),
        (r1.get("error") or r1.get("result") or "")[:160],
    )

    # --- 2 search + patch ---
    r2 = chat_once(
        bundle,
        (
            "在工作区用 search 找到 REPLACE_ME，再用 apply_patch 把 seed.txt 里的 "
            "REPLACE_ME 换成 PATCHED。完成后 done。"
        ),
        workspace=project,
    )
    seed = (project / "seed.txt").read_text(encoding="utf-8")
    ok &= _ok(
        "case2 search+patch",
        bool(r2.get("success")) and "PATCHED" in seed and "REPLACE_ME" not in seed,
        (r2.get("error") or r2.get("result") or "")[:160],
    )

    # --- 3 shell ---
    r3 = chat_once(
        bundle,
        (
            "用 shell 工具执行：echo live-case-3 > live_shell.txt。"
            "然后 done。"
        ),
        workspace=project,
    )
    f3 = project / "live_shell.txt"
    ok &= _ok(
        "case3 shell",
        bool(r3.get("success")) and f3.is_file() and "live-case-3" in f3.read_text(encoding="utf-8"),
        (r3.get("error") or r3.get("result") or "")[:160],
    )

    print()
    if ok:
        print("[OK] OpenCode harness live 三用例全绿")
        print("仍建议人手：绑真实仓库 chat 改 README，并勾 docs/GRADUATION_EXPORTABLE_AGENT.md §C")
    else:
        print("[FAIL] live 未通过 — 查模型是否遵守 JSON tool 协议 / Key 是否有效")

    if args.keep:
        print(f"保留目录: {tmp}")
    else:
        shutil.rmtree(tmp, ignore_errors=True)

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
