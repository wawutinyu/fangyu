"""Agent Registry — AgentCard 注册与发现"""
from typing import Optional
from .protocol import AgentCard


class AgentRegistry:
    _agents: dict[str, AgentCard] = {}
    _factories: dict[str, callable] = {}

    @classmethod
    def register(cls, name: str, factory: callable = None):
        cls._factories[name] = factory

    @classmethod
    def list_agents(cls) -> list[str]:
        return list(cls._factories.keys())

    @classmethod
    def create_agent(cls, name: str):
        factory = cls._factories.get(name)
        return factory() if factory else None
