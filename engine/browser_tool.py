"""浏览器 / Computer-use 最小原料。

默认引擎：static（httpx 拉 HTML → 文本/链接快照，可按链接索引跳转）。
可选：安装 playwright 后自动升级为真实页操作（click/type）。
"""
from __future__ import annotations

import re
import threading
import time
import uuid
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

_lock = threading.Lock()
_SESSIONS: dict[str, dict[str, Any]] = {}


def clear_browser_sessions() -> None:
    with _lock:
        for s in _SESSIONS.values():
            closer = s.get("_close")
            if callable(closer):
                try:
                    closer()
                except Exception:
                    pass
        _SESSIONS.clear()


def playwright_available() -> bool:
    try:
        import playwright  # noqa: F401
        return True
    except ImportError:
        return False


class _LinkExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self._in_title = False
        self.links: list[dict[str, str]] = []
        self._text_parts: list[str] = []
        self._skip = False
        self._current_link: int | None = None

    def handle_starttag(self, tag, attrs):
        ad = dict(attrs)
        if tag == "title":
            self._in_title = True
        if tag in ("script", "style", "noscript"):
            self._skip = True
        if tag == "a":
            href = (ad.get("href") or "").strip()
            if href:
                self.links.append({"href": href, "text": ""})
                self._current_link = len(self.links) - 1
            else:
                self._current_link = None
        else:
            self._current_link = None
        if tag in ("p", "div", "br", "li", "h1", "h2", "h3", "tr"):
            self._text_parts.append("\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag in ("script", "style", "noscript"):
            self._skip = False
        if tag == "a":
            self._current_link = None

    def handle_data(self, data):
        if self._skip:
            return
        text = data.strip()
        if not text:
            return
        if self._in_title:
            self.title += text
        self._text_parts.append(text + " ")
        if getattr(self, "_current_link", None) is not None:
            self.links[self._current_link]["text"] += text + " "


def _normalize_url(url: str) -> str:
    u = (url or "").strip()
    if not u:
        raise ValueError("url 不能为空")
    parsed = urlparse(u)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("仅允许 http/https")
    return u


def _extract(html: str, base_url: str) -> dict[str, Any]:
    parser = _LinkExtractor()
    try:
        parser.feed(html or "")
    except Exception:
        pass
    links = []
    for i, link in enumerate(parser.links[:80]):
        href = urljoin(base_url, link["href"])
        if urlparse(href).scheme not in ("http", "https"):
            continue
        links.append({
            "i": len(links),
            "text": (link["text"] or "").strip()[:120],
            "href": href,
        })
    text = re.sub(r"\s+", " ", " ".join(parser._text_parts)).strip()
    return {
        "title": (parser.title or "").strip()[:200],
        "text": text[:12000],
        "links": links,
    }


def _get_session(session_id: str = "") -> dict[str, Any]:
    sid = (session_id or "").strip()
    with _lock:
        if sid and sid in _SESSIONS:
            return _SESSIONS[sid]
        if not sid:
            # 复用最近一个，或新建
            if _SESSIONS:
                return next(reversed(_SESSIONS.values()))
        new_id = sid or uuid.uuid4().hex[:10]
        sess = {
            "id": new_id,
            "engine": "playwright" if playwright_available() else "static",
            "url": "",
            "title": "",
            "text": "",
            "links": [],
            "history": [],
            "updated_at": time.time(),
        }
        _SESSIONS[new_id] = sess
        return sess


def tool_browser_open(url: str = "", session_id: str = "") -> dict[str, Any]:
    """打开页面并返回文本快照（computer-use 入门）。"""
    target = _normalize_url(url)
    sess = _get_session(session_id)
    if sess.get("engine") == "playwright":
        try:
            return _playwright_open(sess, target)
        except Exception as exc:
            sess["engine"] = "static"
            sess["playwright_error"] = str(exc)
    return _static_open(sess, target)


def _static_open(sess: dict[str, Any], url: str) -> dict[str, Any]:
    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        resp = client.get(url, headers={"User-Agent": "fangyu-browser/1.0"})
        html = resp.text
        final = str(resp.url)
    extracted = _extract(html, final)
    sess["url"] = final
    sess["title"] = extracted["title"]
    sess["text"] = extracted["text"]
    sess["links"] = extracted["links"]
    sess["history"].append(final)
    sess["updated_at"] = time.time()
    return {
        "ok": True,
        "session_id": sess["id"],
        "engine": "static",
        "url": final,
        "title": sess["title"],
        "text": sess["text"][:4000],
        "links": sess["links"][:40],
        "hint": "用 browser_click(link_index=N) 跟随链接；安装 playwright 可升级为真实点击。",
    }


def _playwright_open(sess: dict[str, Any], url: str) -> dict[str, Any]:
    from playwright.sync_api import sync_playwright

    if not sess.get("_pw"):
        pw = sync_playwright().start()
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        sess["_pw"] = pw
        sess["_browser"] = browser
        sess["_page"] = page
        sess["_close"] = lambda: (browser.close(), pw.stop())

    page = sess["_page"]
    page.goto(url, wait_until="domcontentloaded", timeout=25000)
    title = page.title()
    text = page.inner_text("body")[:12000]
    hrefs = page.eval_on_selector_all(
        "a[href]",
        "els => els.slice(0,80).map((a,i)=>({i, text:(a.innerText||'').trim().slice(0,120), href:a.href}))",
    )
    sess["url"] = page.url
    sess["title"] = title
    sess["text"] = text
    sess["links"] = hrefs
    sess["history"].append(page.url)
    sess["updated_at"] = time.time()
    return {
        "ok": True,
        "session_id": sess["id"],
        "engine": "playwright",
        "url": page.url,
        "title": title,
        "text": text[:4000],
        "links": hrefs[:40],
    }


def tool_browser_snapshot(session_id: str = "", max_chars: int = 4000) -> dict[str, Any]:
    sess = _get_session(session_id)
    if not sess.get("url"):
        return {"ok": False, "error": "无打开页面，先 browser_open"}
    return {
        "ok": True,
        "session_id": sess["id"],
        "engine": sess.get("engine"),
        "url": sess.get("url"),
        "title": sess.get("title"),
        "text": str(sess.get("text") or "")[: max(500, int(max_chars))],
        "links": (sess.get("links") or [])[:40],
    }


def tool_browser_click(
    link_index: int = -1,
    selector: str = "",
    session_id: str = "",
) -> dict[str, Any]:
    """点击：static 引擎按 links[i] 跳转；playwright 可用 selector。"""
    sess = _get_session(session_id)
    if sess.get("engine") == "playwright" and sess.get("_page"):
        page = sess["_page"]
        if selector:
            page.click(selector, timeout=10000)
        elif link_index >= 0:
            links = sess.get("links") or []
            if link_index >= len(links):
                return {"ok": False, "error": f"link_index 越界 (0..{len(links)-1})"}
            page.goto(links[link_index]["href"], wait_until="domcontentloaded", timeout=25000)
        else:
            return {"ok": False, "error": "需要 link_index 或 selector"}
        return tool_browser_snapshot(session_id=sess["id"])

    links = sess.get("links") or []
    if link_index < 0 or link_index >= len(links):
        return {"ok": False, "error": f"需要有效 link_index (0..{max(0, len(links)-1)})；selector 需 playwright"}
    href = links[link_index]["href"]
    return tool_browser_open(url=href, session_id=sess["id"])


def tool_browser_type(
    selector: str = "",
    text: str = "",
    session_id: str = "",
) -> dict[str, Any]:
    """仅 playwright：向选择器输入文本。"""
    sess = _get_session(session_id)
    if sess.get("engine") != "playwright" or not sess.get("_page"):
        return {
            "ok": False,
            "error": "browser_type 需要 playwright 引擎（pip install playwright && playwright install chromium）",
            "engine": sess.get("engine"),
        }
    if not selector:
        return {"ok": False, "error": "需要 selector"}
    page = sess["_page"]
    page.fill(selector, text or "")
    return {"ok": True, "session_id": sess["id"], "selector": selector, "typed_chars": len(text or "")}
