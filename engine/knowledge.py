import json
import os
import re
import uuid
from pathlib import Path

from .embedding import get_embedding, cosine_similarity, text_similarity
from .vectorstore import VectorRecord, get_default_store

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / 'data' / 'uploads'

KNOWLEDGE_COLLECTION = "knowledge"


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


def chunk_vector_id(chunk_id: int) -> str:
    return f"chunk:{chunk_id}"


def upsert_knowledge_chunks(
    *,
    doc_id: int,
    chunk_rows: list[dict],
) -> int:
    """写入方隅向量层。chunk_rows: {id, content, idx, embedding?}"""
    col = get_default_store().collection(KNOWLEDGE_COLLECTION)
    records: list[VectorRecord] = []
    for row in chunk_rows:
        emb = row.get("embedding")
        if isinstance(emb, str) and emb:
            try:
                emb = json.loads(emb)
            except json.JSONDecodeError:
                emb = None
        records.append(
            VectorRecord(
                id=chunk_vector_id(int(row["id"])),
                vector=emb if isinstance(emb, list) else None,
                payload={
                    "content": row.get("content") or "",
                    "doc_id": doc_id,
                    "idx": row.get("idx", 0),
                    "chunk_id": int(row["id"]),
                },
            )
        )
    return col.upsert(records)


def delete_knowledge_doc_vectors(doc_id: int) -> int:
    return get_default_store().collection(KNOWLEDGE_COLLECTION).delete_where(doc_id=doc_id)


async def search_knowledge_store(query: str, top_k: int = 5) -> list[dict]:
    """主路径：走方隅·知向量层。"""
    col = get_default_store().collection(KNOWLEDGE_COLLECTION)
    query_embedding = await get_embedding(query)
    hits = col.search(
        query_embedding,
        query_text=query,
        top_k=top_k,
    )
    out: list[dict] = []
    for h in hits:
        out.append(
            {
                "id": h.payload.get("chunk_id"),
                "doc_id": h.payload.get("doc_id"),
                "content": h.payload.get("content", ""),
                "score": h.score,
                "vector_id": h.id,
            }
        )
    return out


async def search_chunks(chunks: list[dict], query: str, top_k: int = 5) -> list[dict]:
    """兼容路径：流程节点内嵌 chunks（不经本地向量库文件）。"""
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
