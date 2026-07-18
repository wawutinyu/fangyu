"""Bundle 内 Coding 手脚 — 供 agent_loop 调用，全部限定在 active workspace。"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any

from fangyu.engine.workspace import WorkspaceError, get_active_workspace


def _ws():
    ws = get_active_workspace()
    if not ws:
        raise WorkspaceError("无 active workspace — 请先 init_bundle_workspace")
    return ws


def tool_read(path: str = "") -> str:
    return _ws().read(path)


def tool_write(path: str = "", content: str = "") -> str:
    _ws().write(path, content)
    return f"wrote {path} ({len(content)} chars)"


def tool_list(path: str = ".") -> list[str]:
    return _ws().list(path)


def tool_search(pattern: str = "", path: str = ".", max_hits: int = 50) -> list[dict[str, Any]]:
    """在工作区内按正则搜文件内容（简易 ripgrep）。"""
    ws = _ws()
    root = ws.resolve(path)
    if not pattern:
        return []
    rx = re.compile(pattern)
    hits: list[dict[str, Any]] = []
    files = [root] if root.is_file() else sorted(root.rglob("*"))
    for f in files:
        if not f.is_file():
            continue
        if ".fangyu" in f.parts:
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        rel = str(f.relative_to(ws.root))
        for i, line in enumerate(text.splitlines(), 1):
            if rx.search(line):
                hits.append({"path": rel, "line": i, "text": line[:200]})
                if len(hits) >= max_hits:
                    return hits
    return hits


def tool_apply_patch(path: str = "", old: str = "", new: str = "") -> str:
    """简单字符串替换补丁（单文件）。"""
    ws = _ws()
    cur = ws.read(path)
    if old not in cur:
        raise ValueError(f"patch old 片段未找到: {path}")
    ws.write(path, cur.replace(old, new, 1))
    return f"patched {path}"


_SHELL_DENY = re.compile(
    r"(rm\s+-rf\s+/|sudo\s+|mkfs|dd\s+if=|:\(\)\s*\{|curl\s+[^\n]*\|\s*sh)",
    re.I,
)


def tool_shell(command: str = "", timeout_sec: float = 30) -> dict[str, Any]:
    """在 workspace 根目录执行 shell（基础拒绝列表；完整策略见 Worker）。"""
    cmd = (command or "").strip()
    if not cmd:
        raise ValueError("empty command")
    if _SHELL_DENY.search(cmd):
        raise PermissionError(f"命令被策略拒绝: {cmd[:80]}")
    ws = _ws()
    proc = subprocess.run(
        cmd,
        shell=True,
        cwd=str(ws.root),
        capture_output=True,
        text=True,
        timeout=timeout_sec,
    )
    return {
        "exit_code": proc.returncode,
        "stdout": (proc.stdout or "")[:8000],
        "stderr": (proc.stderr or "")[:4000],
    }


def coding_toolbelt() -> dict[str, Any]:
    """agent_loop 用的默认工具表。"""
    return {
        "read": tool_read,
        "write": tool_write,
        "list": tool_list,
        "search": tool_search,
        "apply_patch": tool_apply_patch,
        "shell": tool_shell,
    }


def _normalize_deliverable_rel(path: str, kind: str) -> str:
    rel = (path or "").strip().lstrip("/")
    if not rel:
        raise ValueError("deliverable path 为空")
    if ".." in Path(rel).parts:
        raise ValueError("非法路径")
    if not rel.startswith("deliverables/"):
        rel = f"deliverables/{rel}"
    p = Path(rel)
    kind_l = (kind or "md").lower().lstrip(".")
    if not p.suffix and kind_l:
        rel = str(p) + f".{kind_l}"
    return rel


def _minimal_docx_bytes(content: str) -> bytes:
    """零依赖：打包最小 OOXML docx（段落 + 简易标题/列表）。"""
    import zipfile
    from io import BytesIO
    from xml.sax.saxutils import escape

    def para(text: str, *, style: str | None = None) -> str:
        ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        return (
            f"<w:p>{ppr}<w:r><w:t xml:space=\"preserve\">"
            f"{escape(text)}</w:t></w:r></w:p>"
        )

    body_parts: list[str] = []
    for line in (content or "").replace("\r\n", "\n").split("\n"):
        raw = line.rstrip()
        if raw.startswith("# "):
            body_parts.append(para(raw[2:].strip() or "Untitled", style="Heading1"))
        elif raw.startswith("## "):
            body_parts.append(para(raw[3:].strip() or "Untitled", style="Heading2"))
        elif raw.startswith("### "):
            body_parts.append(para(raw[4:].strip() or "Untitled", style="Heading2"))
        elif raw.startswith("- ") or raw.startswith("* "):
            body_parts.append(para("• " + raw[2:].strip()))
        elif raw.strip():
            body_parts.append(para(raw))
    if not body_parts:
        body_parts.append(para(content or ""))

    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{''.join(body_parts)}<w:sectPr/></w:body></w:document>"
    )
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("word/document.xml", document_xml)
    return buf.getvalue()


def _content_to_docx_bytes(content: str) -> bytes:
    """优先 python-docx；否则内置简易 OOXML。"""
    try:
        from docx import Document
        from io import BytesIO

        doc = Document()
        text = content or ""
        blocks = text.replace("\r\n", "\n").split("\n")
        para_buf: list[str] = []

        def flush_para() -> None:
            nonlocal para_buf
            if para_buf:
                doc.add_paragraph("\n".join(para_buf).strip())
                para_buf = []

        for line in blocks:
            raw = line.rstrip()
            if raw.startswith("# "):
                flush_para()
                doc.add_heading(raw[2:].strip() or "Untitled", level=1)
            elif raw.startswith("## "):
                flush_para()
                doc.add_heading(raw[3:].strip() or "Untitled", level=2)
            elif raw.startswith("### "):
                flush_para()
                doc.add_heading(raw[4:].strip() or "Untitled", level=3)
            elif raw.startswith("- ") or raw.startswith("* "):
                flush_para()
                doc.add_paragraph(raw[2:].strip(), style="List Bullet")
            elif not raw.strip():
                flush_para()
            else:
                para_buf.append(raw)
        flush_para()
        if not any(p.text.strip() for p in doc.paragraphs):
            doc.add_paragraph(text or "")
        buf = BytesIO()
        doc.save(buf)
        return buf.getvalue()
    except ImportError:
        return _minimal_docx_bytes(content)


def tool_write_deliverable(path: str = "", content: str = "", kind: str = "md") -> str:
    """把成品写入 workspace/deliverables/（md 文本；docx 用 python-docx）。"""
    kind_l = (kind or "md").lower().lstrip(".")
    # 路径已带后缀时以后缀为准
    probe = (path or "").strip()
    if probe.lower().endswith(".docx"):
        kind_l = "docx"
    elif probe.lower().endswith(".md") or probe.lower().endswith(".txt"):
        kind_l = Path(probe).suffix.lstrip(".").lower() or kind_l

    rel = _normalize_deliverable_rel(path, kind_l)
    if kind_l == "docx":
        data = _content_to_docx_bytes(content)
        _ws().write_bytes(rel, data)
        return f"deliverable {rel} (docx, {len(data)} bytes)"
    _ws().write(rel, content)
    return f"deliverable {rel} ({len(content)} chars)"


def tool_list_deliverables() -> list[str]:
    ws = _ws()
    root = ws.resolve("deliverables")
    if not root.exists():
        return []
    out: list[str] = []
    for f in sorted(root.rglob("*")):
        if f.is_file():
            out.append(str(f.relative_to(ws.root)))
    return out


def office_toolbelt() -> dict[str, Any]:
    """WorkBuddy 办公工具表：读写 + 成品落盘（无 shell）。"""
    return {
        "read": tool_read,
        "write": tool_write,
        "list": tool_list,
        "write_deliverable": tool_write_deliverable,
        "list_deliverables": tool_list_deliverables,
    }


def resolve_toolbelt(toolbelt: str | None) -> dict[str, Any]:
    tb = (toolbelt or "coding").strip().lower()
    if tb == "office":
        return office_toolbelt()
    return coding_toolbelt()
