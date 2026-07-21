"""Q1：结构化 node/flow 追踪表。"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Index
from sqlalchemy.sql import func

from .database import Base


class TraceLog(Base):
    __tablename__ = "execution_traces"
    __table_args__ = (
        Index("ix_execution_traces_trace_event", "trace_id", "event_type"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    trace_id = Column(String(64), nullable=False, index=True, default="")
    flow_id = Column(String(64), default="", index=True)
    node_id = Column(String(64), default="")
    node_name = Column(String(128), default="")
    node_type = Column(String(32), default="")
    event_type = Column(String(16), default="")  # start | end | error | flow_start | flow_end
    timestamp = Column(Float, default=0.0)
    duration_ms = Column(Float, nullable=True)
    payload_json = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())
