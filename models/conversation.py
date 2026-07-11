from sqlalchemy import Column, Integer, String, Text, DateTime, func
from .database import Base


class ConversationLog(Base):
    __tablename__ = "conversation_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), default="default")
    role = Column(String(16), nullable=False)
    content = Column(Text, default="")
    timestamp = Column(DateTime, server_default=func.now())
