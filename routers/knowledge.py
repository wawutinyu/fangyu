import json
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from ..models.database import get_session
from ..models.knowledge import KnowledgeDoc, KnowledgeChunk
from fangyu.engine.knowledge import save_upload_file, extract_and_chunk, search_chunks
from fangyu.engine.embedding import get_embeddings_batch

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

    for i, chunk_text in enumerate(chunks):
        emb_json = json.dumps(embeddings[i]) if i < len(embeddings) and embeddings[i] else None
        db.add(KnowledgeChunk(doc_id=doc.id, content=chunk_text, idx=i, embedding=emb_json))

    await db.commit()

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
    result = await db.execute(select(KnowledgeChunk))
    all_chunks = result.scalars().all()

    chunks_data = [
        {'id': c.id, 'doc_id': c.doc_id, 'content': c.content, 'embedding': c.embedding}
        for c in all_chunks
    ]
    matched = await search_chunks(chunks_data, req.query, req.top_k)
    context = '\n\n'.join([f'[{i+1}] {m["content"]}' for i, m in enumerate(matched)])

    return {
        'results': matched,
        'context': context,
    }
