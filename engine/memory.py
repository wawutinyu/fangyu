import json
import re
from pathlib import Path
from typing import Any

from .embedding import get_embedding_sync
from .vectorstore import VectorRecord, get_default_store

MEMORY_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "memory"
MEMORY_COLLECTION = "memory"


def _ensure_dir():
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)


def _scope_file(scope: str) -> Path:
    _ensure_dir()
    return MEMORY_DIR / f"{scope}.json"


def _load_scope(scope: str) -> dict[str, str]:
    fpath = _scope_file(scope)
    if fpath.exists():
        try:
            return json.loads(fpath.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_scope(scope: str, data: dict[str, str]):
    fpath = _scope_file(scope)
    fpath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def memory_vector_id(scope: str, key: str) -> str:
    return f"memory:{scope}:{key}"


def _upsert_memory_vector(scope: str, key: str, value: str) -> None:
    text = f"{key}\n{value}"
    emb = get_embedding_sync(text)
    get_default_store().collection(MEMORY_COLLECTION).upsert(
        [
            VectorRecord(
                id=memory_vector_id(scope, key),
                vector=emb,
                payload={
                    "scope": scope,
                    "key": key,
                    "value": value,
                    "content": value,
                },
            )
        ]
    )


def _delete_memory_vector(scope: str, key: str) -> None:
    get_default_store().collection(MEMORY_COLLECTION).delete([memory_vector_id(scope, key)])


def _sync_scope_to_vectorstore(scope: str) -> int:
    """JSON 文件 → 向量层（升级兼容 / 空库回填）。"""
    data = _load_scope(scope)
    if not data:
        return 0
    n = 0
    for k, v in data.items():
        _upsert_memory_vector(scope, k, v)
        n += 1
    return n


def memory_read(scope: str, key: str) -> str | None:
    data = _load_scope(scope)
    return data.get(key)


def memory_write(scope: str, key: str, value: str):
    data = _load_scope(scope)
    data[key] = value
    _save_scope(scope, data)
    _upsert_memory_vector(scope, key, value)


def memory_delete(scope: str, key: str):
    data = _load_scope(scope)
    data.pop(key, None)
    _save_scope(scope, data)
    _delete_memory_vector(scope, key)


def memory_replace(scope: str, old_fact: str, new_fact: str) -> bool:
    data = _load_scope(scope)
    for k, v in list(data.items()):
        if v == old_fact:
            data[k] = new_fact
            _save_scope(scope, data)
            _upsert_memory_vector(scope, k, new_fact)
            return True
    return False


def memory_list(scope: str) -> list[dict[str, str]]:
    data = _load_scope(scope)
    return [{"key": k, "value": v} for k, v in data.items()]


def memory_search(scope: str, query: str, limit: int = 10) -> list[dict[str, Any]]:
    """语义/混合检索（方隅·知）；无命中时回退子串匹配。"""
    col = get_default_store().collection(MEMORY_COLLECTION)
    data = _load_scope(scope)
    if data and col.count_where(scope=scope) == 0:
        _sync_scope_to_vectorstore(scope)

    emb = get_embedding_sync(query) if query else None
    hits = col.search(
        emb,
        query_text=query,
        top_k=max(1, int(limit)),
        payload_filter={"scope": scope},
    )
    if hits:
        return [
            {
                "key": h.payload.get("key", ""),
                "value": h.payload.get("value") or h.payload.get("content", ""),
                "scope": scope,
                "score": h.score,
            }
            for h in hits
        ]

    # 回退：旧子串逻辑
    q = (query or "").lower()
    results = []
    for k, v in data.items():
        if q in k.lower() or q in v.lower():
            results.append({"key": k, "value": v, "scope": scope})
    return results[:limit]


def memory_extract_facts(text: str, max_facts: int = 3) -> list[str]:
    if not text:
        return []
    sentences = re.split(r'[。！\n]', text)
    facts = []
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if any(kw in s for kw in ["是", "叫", "喜欢", "住在", "工作", "使用", "用", "需要", "想要", "希望", "认为", "觉得", "可以", "不能", "会", "不会"]):
            if len(s) > 5 and len(s) < 200:
                facts.append(s)
        if len(facts) >= max_facts:
            break
    return facts
