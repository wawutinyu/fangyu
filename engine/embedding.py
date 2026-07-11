import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_encoder = None


def _char_ngrams(text: str, n: int = 2) -> set[str]:
    return {text[i:i + n] for i in range(len(text) - n + 1)}


def _tokenize_mixed(text: str) -> list[str]:
    import re
    tokens = []
    for t in re.findall(r'[a-zA-Z0-9_]+|[^\s]', text):
        t = t.strip()
        if t:
            tokens.append(t)
    return tokens


def text_similarity(query: str, content: str) -> float:
    q_ngrams = _char_ngrams(query, 2) | _char_ngrams(query, 3)
    c_ngrams = _char_ngrams(content, 2) | _char_ngrams(content, 3)
    if not q_ngrams:
        return 0.0
    overlap = len(q_ngrams & c_ngrams)
    return overlap / len(q_ngrams)


async def _get_encoder():
    global _encoder
    if _encoder is not None:
        return _encoder
    try:
        from sentence_transformers import SentenceTransformer
        _encoder = await asyncio.to_thread(
            SentenceTransformer, "BAAI/bge-small-zh-v1.5"
        )
        logger.info("Loaded local embedding model: BAAI/bge-small-zh-v1.5")
    except ImportError:
        logger.warning("sentence-transformers not installed, using n-gram similarity")
        return None
    except Exception as e:
        logger.warning(f"Failed to load embedding model: {e}")
        return None
    return _encoder


async def get_embedding(text: str) -> Optional[list[float]]:
    enc = await _get_encoder()
    if enc is None:
        return None
    try:
        emb = await asyncio.to_thread(enc.encode, text, normalize_embeddings=True)
        return emb.tolist()
    except Exception as e:
        logger.warning(f"Embedding failed: {e}")
        return None


async def get_embeddings_batch(texts: list[str]) -> list[Optional[list[float]]]:
    enc = await _get_encoder()
    if enc is None or not texts:
        return [None] * len(texts)
    try:
        embs = await asyncio.to_thread(enc.encode, texts, normalize_embeddings=True)
        return [e.tolist() for e in embs]
    except Exception as e:
        logger.warning(f"Batch embedding failed: {e}")
        return [None] * len(texts)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    if not na or not nb:
        return 0.0
    return dot / (na * nb)
