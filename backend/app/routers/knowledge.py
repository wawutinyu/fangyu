from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from ..models.database import get_session
from ..models.knowledge import KnowledgeDoc, KnowledgeChunk
from ..services.knowledge import save_upload_file, extract_and_chunk, search_chunks

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

    for i, chunk_text in enumerate(chunks):
        db.add(KnowledgeChunk(doc_id=doc.id, content=chunk_text, idx=i))

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


@router.post("/search")
async def search(req: SearchRequest, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(KnowledgeChunk))
    all_chunks = result.scalars().all()

    chunks_data = [{'id': c.id, 'doc_id': c.doc_id, 'content': c.content} for c in all_chunks]
    matched = search_chunks(chunks_data, req.query, req.top_k)
    context = '\n\n'.join([f'[{i+1}] {m["content"]}' for i, m in enumerate(matched)])

    return {
        'results': matched,
        'context': context,
    }
