from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from .database import Base


class KnowledgeDoc(Base):
    __tablename__ = 'knowledge_docs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(256), nullable=False)
    file_path = Column(String(512), default='')
    chunk_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())


class KnowledgeChunk(Base):
    __tablename__ = 'knowledge_chunks'

    id = Column(Integer, primary_key=True, autoincrement=True)
    doc_id = Column(Integer, ForeignKey('knowledge_docs.id', ondelete='CASCADE'), nullable=False)
    content = Column(Text, nullable=False)
    idx = Column(Integer, default=0)
    embedding = Column(Text, nullable=True)
