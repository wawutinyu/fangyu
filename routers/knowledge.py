import json
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from ..models.database import get_session
from ..models.knowledge import KnowledgeDoc, KnowledgeChunk
from fangyu.engine.knowledge import (
    save_upload_file,
    extract_and_chunk,
    search_knowledge_store,
    upsert_knowledge_chunks,
    delete_knowledge_doc_vectors,
)
from fangyu.engine.embedding import get_embeddings_batch
from fangyu.engine.vectorstore import get_default_store

router = APIRouter(prefix="/api/v1/knowledge", tags=["知识库"])


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    knowledge_base: str = ''


@router.post("/upload")
async def upload_doc(file: UploadFile = File(...), db: AsyncSession = Depends(get_session)):
    if not file.filename:
        raise HTTPException(400, '文件名不能为空')

    content = await file.read()
    file_path = save_upload_file(file.filename, content)
    chunks = extract_and_chunk(file_path)

    doc = KnowledgeDoc(name=file.filename, file_path=file_path, chunk_count=len(chunks))
    db.add(doc)
    await db.flush()

    embeddings = await get_embeddings_batch(chunks)

    chunk_rows: list[dict] = []
    for i, chunk_text in enumerate(chunks):
        emb = embeddings[i] if i < len(embeddings) and embeddings[i] else None
        emb_json = json.dumps(emb) if emb else None
        row = KnowledgeChunk(doc_id=doc.id, content=chunk_text, idx=i, embedding=emb_json)
        db.add(row)
        await db.flush()
        chunk_rows.append(
            {"id": row.id, "content": chunk_text, "idx": i, "embedding": emb}
        )

    await db.commit()
    upsert_knowledge_chunks(doc_id=doc.id, chunk_rows=chunk_rows)

    return {
        'id': doc.id,
        'name': doc.name,
        'chunk_count': len(chunks),
    }


@router.get("/docs")
async def list_docs(db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(KnowledgeDoc).order_by(KnowledgeDoc.created_at.desc()))
    docs = result.scalars().all()
    return {'docs': [{'id': d.id, 'name': d.name, 'chunk_count': d.chunk_count, 'created_at': str(d.created_at)} for d in docs]}


@router.delete("/docs/{doc_id}")
async def delete_doc(doc_id: int, db: AsyncSession = Depends(get_session)):
    await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.doc_id == doc_id))
    await db.execute(delete(KnowledgeDoc).where(KnowledgeDoc.id == doc_id))
    await db.commit()
    delete_knowledge_doc_vectors(doc_id)
    return {'success': True}


@router.get("/export-chunks")
async def export_chunks(db: AsyncSession = Depends(get_session)):
    """导出全部知识块（供独立 .exe 内嵌）"""
    result = await db.execute(select(KnowledgeChunk))
    chunks = result.scalars().all()
    return {
        'chunks': [
            {'content': c.content, 'metadata': {'doc_id': c.doc_id, 'idx': c.idx}}
            for c in chunks
        ],
    }


@router.post("/search")
async def search(req: SearchRequest, db: AsyncSession = Depends(get_session)):
    # 主路径：方隅·知向量层；若为空则从 SQL 回填一次（升级兼容）
    store = get_default_store().collection("knowledge")
    if store.count() == 0:
        result = await db.execute(select(KnowledgeChunk))
        all_chunks = result.scalars().all()
        if all_chunks:
            by_doc: dict[int, list[dict]] = {}
            for c in all_chunks:
                by_doc.setdefault(c.doc_id, []).append(
                    {
                        "id": c.id,
                        "content": c.content,
                        "idx": c.idx,
                        "embedding": c.embedding,
                    }
                )
            for doc_id, rows in by_doc.items():
                upsert_knowledge_chunks(doc_id=doc_id, chunk_rows=rows)

    matched = await search_knowledge_store(req.query, req.top_k)
    context = '\n\n'.join([f'[{i+1}] {m["content"]}' for i, m in enumerate(matched)])

    return {
        'results': matched,
        'context': context,
    }


@router.get("/vector-status")
async def vector_status():
    """方隅·知向量层状态（调试 / 原生壳探活）。"""
    store = get_default_store()
    knowledge = store.collection("knowledge")
    memory = store.collection("memory")
    return {
        "backend": "fangyu.vectorstore",
        "collections": {
            "knowledge": {"count": knowledge.count(), "path": str(knowledge.db_path)},
            "memory": {"count": memory.count(), "path": str(memory.db_path)},
        },
    }
