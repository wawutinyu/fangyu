import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

INDEX_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "search"
INDEX_FILE = INDEX_DIR / "conversations.jsonl"


def _ensure():
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    if not INDEX_FILE.exists():
        INDEX_FILE.write_text("", encoding="utf-8")


def index_message(session_id: str, role: str, content: str):
    _ensure()
    entry = {
        "session_id": session_id,
        "role": role,
        "content": content,
        "timestamp": datetime.utcnow().isoformat(),
    }
    with open(INDEX_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def search_messages(query: str, session_id: str | None = None, limit: int = 10) -> list[dict]:
    _ensure()
    q = query.lower()
    terms = set(re.findall(r'\w+', q))
    scored = []

    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if session_id and entry.get("session_id") != session_id:
                continue

            content = entry.get("content", "").lower()
            score = 0
            for term in terms:
                score += content.count(term)
            if score > 0:
                scored.append((score, entry))

    scored.sort(key=lambda x: -x[0])
    return [item[1] for item in scored[:limit]]
