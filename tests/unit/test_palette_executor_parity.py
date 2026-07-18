"""面板现行节点 ↔ 后端执行器 一一对应（防「拖得出却跑不了」）"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY_TS = ROOT / "fangyu-canvas" / "src" / "utils" / "nodeRegistry.ts"
ENGINE = ROOT / "engine"


def _active_palette_types() -> list[str]:
    text = REGISTRY_TS.read_text(encoding="utf-8")
    node_types = re.findall(r"type:\s*'([a-z0-9-]+)',\s*name:", text)
    legacy_block = re.search(r"LEGACY_TYPES\s*=\s*new Set\(\[([^\]]+)\]", text, re.S)
    assert legacy_block, "LEGACY_TYPES not found"
    legacy = set(re.findall(r"'([a-z0-9-]+)'", legacy_block.group(1)))
    # preserve order, unique
    seen = set()
    out = []
    for t in node_types:
        if t in legacy or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def _registered_executors() -> set[str]:
    names: set[str] = set()
    for path in ENGINE.glob("exec_*.py"):
        names |= set(re.findall(r'register_executor\("([^"]+)"', path.read_text(encoding="utf-8")))
    return names


def test_every_active_palette_node_has_executor():
    active = _active_palette_types()
    execs = _registered_executors()
    missing = [t for t in active if t not in execs]
    assert active, "no active palette types parsed"
    assert not missing, f"palette nodes without executor: {missing}"


def test_active_count_is_stable_enough():
    # 防止误把大量 legacy 放回面板
    active = _active_palette_types()
    assert 15 <= len(active) <= 40, f"unexpected active count: {len(active)} {active}"
