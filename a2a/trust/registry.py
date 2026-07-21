"""TrustRegistry — 身份注册 + 授权 + 吊销 + 防重放。

协议实现源。应用代码 / API / 引擎请从 ``fangyu.engine.trust_runtime`` 导入
（该模块 re-export 本类），勿在业务层直接依赖多套入口。
"""
from collections import OrderedDict
from typing import Optional


class TrustRegistry:
    _identities: dict[str, str] = {}
    _policies: dict[str, list[str]] = {}
    _revoked: set[str] = set()
    # S0-D3：FIFO 淘汰，禁止 len>10k 时整表 clear（会抹掉未过期 nonce → 重放窗口）
    _nonces: OrderedDict[str, None] = OrderedDict()
    _NONCE_CAP = 10000

    @classmethod
    def register(cls, agent_id: str, public_key: str, allowed_skills: list[str] = None):
        cls._identities[agent_id] = public_key
        cls._policies[agent_id] = allowed_skills or ["*"]

    @classmethod
    def get_public_key(cls, agent_id: str) -> Optional[str]:
        return None if agent_id in cls._revoked else cls._identities.get(agent_id)

    @classmethod
    def revoke(cls, agent_id: str):
        cls._revoked.add(agent_id)

    @classmethod
    def check_nonce(cls, nonce: str) -> bool:
        if nonce in cls._nonces:
            return False
        cls._nonces[nonce] = None
        while len(cls._nonces) > cls._NONCE_CAP:
            cls._nonces.popitem(last=False)
        return True

    @classmethod
    def authorize(cls, agent_id: str, skill_id: str) -> bool:
        if agent_id in cls._revoked:
            return False
        allowed = cls._policies.get(agent_id, [])
        return "*" in allowed or skill_id in allowed

    @classmethod
    def reset(cls) -> None:
        """测试 / 热重载：清空全部注册状态。"""
        cls._identities.clear()
        cls._policies.clear()
        cls._revoked.clear()
        cls._nonces.clear()


def reset_trust_for_tests() -> None:
    TrustRegistry.reset()
