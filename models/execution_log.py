from sqlalchemy import Column, Integer, String, Text, DateTime, Float
from sqlalchemy.sql import func
from .database import Base


class ExecutionLog(Base):
    __tablename__ = "execution_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    flow_id = Column(String(64), default="")
    session_id = Column(String(64), default="")
    node_id = Column(String(32), default="")
    node_name = Column(String(128), default="")
    node_type = Column(String(32), default="")
    log_type = Column(String(16), default="")  # start / complete / error
    inputs_json = Column(Text, default="")
    outputs_json = Column(Text, default="")
    error = Column(Text, default="")
    duration_ms = Column(Float, default=0.0)
    token_usage = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())
