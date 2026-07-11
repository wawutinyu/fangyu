import json
import os
import re
import uuid
from pathlib import Path

from .embedding import get_embedding, get_embeddings_batch, cosine_similarity, text_similarity

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / 'data' / 'uploads'


def _ensure_upload_dir():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _auto_decode(data: bytes) -> str:
    for enc in ("utf-8", "gbk", "gb2312", "gb18030", "utf-16", "ascii"):
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return data.decode("utf-8", errors="replace")


def _extract_text(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    with open(file_path, 'rb') as f:
        raw = f.read()
    text = _auto_decode(raw)
    if ext == '.json':
        import json as _json
        try:
            obj = _json.loads(text)
            if isinstance(obj, str):
                text = obj
            else:
                text = _json.dumps(obj, ensure_ascii=False)
        except _json.JSONDecodeError:
            pass
    return text


def _split_chunks(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    paragraphs = re.split(r'\n\s*\n', text)
    chunks = []
    buffer = ''
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(buffer) + len(para) < chunk_size:
            buffer = (buffer + '\n' + para).strip()
        else:
            if buffer:
                chunks.append(buffer)
            buffer = para
    if buffer:
        chunks.append(buffer)

    if not chunks:
        words = text.split()
        for i in range(0, len(words), chunk_size):
            chunks.append(' '.join(words[i:i + chunk_size]))

    return chunks if chunks else [text]


def save_upload_file(filename: str, content: bytes) -> str:
    _ensure_upload_dir()
    unique_name = f'{uuid.uuid4().hex}_{filename}'
    file_path = str(UPLOAD_DIR / unique_name)
    with open(file_path, 'wb') as f:
        f.write(content)
    return file_path


def extract_and_chunk(file_path: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    text = _extract_text(file_path)
    return _split_chunks(text, chunk_size, overlap)


async def search_chunks(chunks: list[dict], query: str, top_k: int = 5) -> list[dict]:
    query_embedding = await get_embedding(query)

    scored = []
    for chunk in chunks:
        ngram_score = text_similarity(query, chunk["content"])
        vec_score = 0.0
        if query_embedding:
            raw = chunk.get("embedding")
            if raw:
                emb = json.loads(raw) if isinstance(raw, str) else raw
                vec_score = cosine_similarity(query_embedding, emb)
        score = vec_score * 0.6 + ngram_score * 0.4
        if score > 0:
            scored.append((score, {**chunk, "score": round(score, 4)}))

    scored.sort(key=lambda x: -x[0])
    return [item[1] for item in scored[:top_k]]
