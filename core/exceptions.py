"""方隅异常继承体系 — 统一 API / 引擎错误形态（兼容现有 Violation 子类）"""
from __future__ import annotations


class FangyuError(Exception):
    """所有方隅业务异常的基类。"""

    def __init__(self, message: str, *, context: dict | None = None):
        self.context = context or {}
        super().__init__(message)

    def to_dict(self) -> dict:
        return {"type": "fangyu", "message": str(self), "context": self.context}


class ConstitutionError(FangyuError, ValueError):
    """宪法违反（与 ConstitutionViolation 语义对齐）。"""

    def __init__(self, rule: str, message: str, *, context: dict | None = None):
        self.rule = rule
        FangyuError.__init__(self, message, context=context)

    def to_dict(self) -> dict:
        return {
            "type": "constitution",
            "rule": self.rule,
            "message": str(self),
            "violations": self.context.get("violations", []),
            "context": self.context.get("context"),
        }


class TrustError(FangyuError, ValueError):
    """ATP 信任层拒绝（与 TrustViolation 语义对齐）。"""

    def __init__(self, rule: str, message: str, *, context: dict | None = None):
        self.rule = rule
        FangyuError.__init__(self, message, context=context)

    def to_dict(self) -> dict:
        return {
            "type": "trust",
            "rule": self.rule,
            "message": str(self),
            "agent": self.context.get("agent"),
            "skill_id": self.context.get("skill_id"),
        }


class BundleError(FangyuError):
    """Bundle 操作错误。"""


class WorkspaceError(FangyuError):
    """Workspace 操作错误。"""
