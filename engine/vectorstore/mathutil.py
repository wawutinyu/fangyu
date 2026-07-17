"""余弦相似度与 n-gram 文本分（不依赖 numpy）。"""

from __future__ import annotations


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / ((na ** 0.5) * (nb ** 0.5))


def _char_ngrams(text: str, n: int) -> set[str]:
    if len(text) < n:
        return {text} if text else set()
    return {text[i : i + n] for i in range(len(text) - n + 1)}


def text_similarity(query: str, content: str) -> float:
    q = (query or "").strip().lower()
    c = (content or "").strip().lower()
    if not q or not c:
        return 0.0
    q_ngrams = _char_ngrams(q, 2) | _char_ngrams(q, 3)
    c_ngrams = _char_ngrams(c, 2) | _char_ngrams(c, 3)
    if not q_ngrams:
        return 0.0
    return len(q_ngrams & c_ngrams) / len(q_ngrams)


def pack_f32(vector: list[float]) -> bytes:
    import struct

    return struct.pack(f"<{len(vector)}f", *vector)


def unpack_f32(blob: bytes) -> list[float]:
    import struct

    n = len(blob) // 4
    if n <= 0:
        return []
    return list(struct.unpack(f"<{n}f", blob[: n * 4]))
