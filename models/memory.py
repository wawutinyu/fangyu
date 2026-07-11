from sqlalchemy import Column, Integer, String, Text, DateTime, func
from .database import Base


class MemoryFact(Base):
    __tablename__ = "memory_facts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scope = Column(String(16), nullable=False, default="user")
    key = Column(String(128), nullable=False)
    value = Column(Text, default="")
    source = Column(String(64), default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
