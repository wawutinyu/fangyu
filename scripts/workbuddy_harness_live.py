#!/usr/bin/env python3
"""WorkBuddy office harness live 验收（真 LLM）。

用例：
  1) write_deliverable 落盘 deliverables/
  2) list_deliverables 可见
  3) 再写一份纪要 md

环境：.env 或 Studio data/fangyu.db 中的 API Key

退出码：0 全绿 / 1 失败 / 2 无 Key 跳过
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


def _ok(label: str, cond: bool, detail: str = "") -> bool:
    mark = "OK" if cond else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"[{mark}] {label}{suffix}")
    return cond


def main() -> int:
    if not ensure_api_keys():
        print("[SKIP] 无 API Key（.env 或 Studio settings）")
        return 2

    from fangyu.core.agent_factory import build_from_profile
    from fangyu.engine.bundle_chat import chat_once

    tmp = Path(tempfile.mkdtemp(prefix="fangyu-wb-live-"))
    project = tmp / "office"
    bundle = tmp / "bundle"
    project.mkdir(parents=True)

    print(f"==> workbuddy live @ {tmp}")
    try:
        build_from_profile(
            "workbuddy",
            bundle,
            name="LiveOffice",
            workspace=project,
            max_turns=12,
        )
    except Exception as exc:
        print(f"[FAIL] create: {exc}")
        shutil.rmtree(tmp, ignore_errors=True)
        return 1

    ok = True
    r1 = chat_once(
        bundle,
        (
            "用 write_deliverable 创建 brief.md，内容恰好一行：wb-live-1。"
            "然后 action=done。"
        ),
        workspace=project,
    )
    f1 = project / "deliverables" / "brief.md"
    ok &= _ok(
        "case1 write_deliverable",
        bool(r1.get("success")) and f1.is_file() and "wb-live-1" in f1.read_text(encoding="utf-8"),
        (r1.get("error") or r1.get("result") or "")[:160],
    )

    r2 = chat_once(
        bundle,
        "调用 list_deliverables，确认有 brief.md，然后 done，result 里写出文件名。",
        workspace=project,
    )
    ok &= _ok(
        "case2 list_deliverables",
        bool(r2.get("success")) and "brief" in str(r2.get("result") or "").lower(),
        (r2.get("error") or r2.get("result") or "")[:160],
    )

    r3 = chat_once(
        bundle,
        (
            "用 write_deliverable 再写 minutes.md，内容一行：meeting-ok。"
            "完成后 done。"
        ),
        workspace=project,
    )
    f3 = project / "deliverables" / "minutes.md"
    ok &= _ok(
        "case3 second deliverable",
        bool(r3.get("success")) and f3.is_file() and "meeting-ok" in f3.read_text(encoding="utf-8"),
        (r3.get("error") or r3.get("result") or "")[:160],
    )

    r4 = chat_once(
        bundle,
        (
            "用 write_deliverable 写一份 Word：path=report，kind=docx，"
            "content 用 Markdown 写「# DocxLive」和一行 body-ok。然后 done。"
        ),
        workspace=project,
    )
    f4 = project / "deliverables" / "report.docx"
    docx_ok = False
    if f4.is_file() and f4.stat().st_size > 400:
        try:
            import zipfile
            with zipfile.ZipFile(f4, "r") as zf:
                xml = zf.read("word/document.xml").decode("utf-8")
            docx_ok = "DocxLive" in xml or "body-ok" in xml or "docx" in str(r4.get("result") or "").lower()
        except Exception:
            docx_ok = bool(r4.get("success")) and f4.is_file()
    ok &= _ok(
        "case4 write_deliverable docx",
        docx_ok,
        (r4.get("error") or r4.get("result") or "")[:160],
    )

    print()
    if ok:
        print("[OK] WorkBuddy office live 三用例全绿")
    else:
        print("[FAIL] workbuddy live 未通过")

    shutil.rmtree(tmp, ignore_errors=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
