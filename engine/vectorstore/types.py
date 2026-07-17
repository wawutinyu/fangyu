"""方隅·知 — 自有向量层类型。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class VectorRecord:
    id: str
    vector: list[float] | None = None
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchHit:
    id: str
    score: float
    payload: dict[str, Any] = field(default_factory=dict)
