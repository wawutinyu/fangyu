"""A2A v1.0 数据模型 — 完全体 (Google Agent2Agent)"""
import json, uuid
from dataclasses import dataclass, field
from typing import Optional


class TaskState:
    SUBMITTED = "submitted"
    WORKING = "working"
    INPUT_REQUIRED = "input-required"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"
    REJECTED = "rejected"

    def __init__(self, state: str, message: str = ""):
        self.state = state
        self.message = message

    def is_terminal(self) -> bool:
        return self.state in (self.COMPLETED, self.FAILED, self.CANCELED, self.REJECTED)

    def to_dict(self):
        d = {"state": self.state}
        if self.message: d["message"] = self.message
        return d


@dataclass
class TaskStatus:
    state: TaskState
    updated_at: str = ""

    def to_dict(self):
        return {"state": self.state.state, "message": self.state.message, "updatedAt": self.updated_at}


@dataclass
class Part:
    type: str = "text"
    text: str = ""
    data: dict = field(default_factory=dict)
    file: dict = field(default_factory=dict)

    @staticmethod
    def text(content: str) -> "Part":
        return Part(type="text", text=content)

    @staticmethod
    def data(obj: dict) -> "Part":
        return Part(type="data", data=obj)

    def to_dict(self):
        if self.type == "text": return {"type": "text", "text": self.text}
        if self.type == "data": return {"type": "data", "data": self.data}
        return {"type": "file", "file": self.file}


@dataclass
class Message:
    role: str = "user"
    parts: list = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    def to_dict(self):
        return {"role": self.role, "parts": [p.to_dict() if isinstance(p, Part) else p for p in self.parts], "metadata": self.metadata}


@dataclass
class Artifact:
    parts: list = field(default_factory=list)
    index: int = 0
    append: bool = False
    metadata: dict = field(default_factory=dict)

    def to_dict(self):
        return {"parts": [p.to_dict() if isinstance(p, Part) else p for p in self.parts], "index": self.index, "append": self.append}


@dataclass
class Task:
    id: str = ""
    status: Optional[TaskStatus] = None
    history: list = field(default_factory=list)
    artifact: Optional[Artifact] = None
    metadata: dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.id: self.id = uuid.uuid4().hex[:12]
        if not self.status: self.status = TaskStatus(TaskState(TaskState.SUBMITTED))

    def to_dict(self):
        d = {"id": self.id, "status": self.status.to_dict()}
        if self.history: d["history"] = [m.to_dict() if isinstance(m, Message) else m for m in self.history]
        if self.artifact: d["artifact"] = self.artifact.to_dict()
        if self.metadata: d["metadata"] = self.metadata
        return d


# Agent Card

@dataclass
class AgentCapabilities:
    streaming: bool = False
    pushNotifications: bool = False
    stateTransitionHistory: bool = False

    def to_dict(self):
        return {"streaming": self.streaming, "pushNotifications": self.pushNotifications}


@dataclass
class AgentInterface:
    type: str = "in-memory"
    port: Optional[int] = None
    path: Optional[str] = None

    def to_dict(self):
        d = {"type": self.type}
        if self.port: d["port"] = self.port
        if self.path: d["path"] = self.path
        return d


@dataclass
class AgentSkill:
    id: str = ""
    name: str = ""
    description: str = ""
    tags: list = field(default_factory=list)
    inputMimeTypes: list = field(default_factory=list)
    outputMimeTypes: list = field(default_factory=list)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description,
                "tags": self.tags, "inputMimeTypes": self.inputMimeTypes, "outputMimeTypes": self.outputMimeTypes}


@dataclass
class AgentCard:
    name: str = ""
    description: str = ""
    version: str = "1.0.0"
    capabilities: AgentCapabilities = field(default_factory=AgentCapabilities)
    skills: list = field(default_factory=list)
    defaultInterface: AgentInterface = field(default_factory=AgentInterface)
    metadata: dict = field(default_factory=dict)

    def to_dict(self):
        return {"name": self.name, "description": self.description, "version": self.version,
                "capabilities": self.capabilities.to_dict(),
                "skills": [s.to_dict() if isinstance(s, AgentSkill) else s for s in self.skills],
                "defaultInterface": self.defaultInterface.to_dict()}
