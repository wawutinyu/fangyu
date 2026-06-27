import json
import time
from pathlib import Path
from typing import Any

VAR_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "variables"
PERSISTENT_FILE = VAR_DIR / "persistent.json"

_ephemeral: dict[str, Any] = {}

VARIABLE_DEFS: dict[str, dict] = {
    "user_profile": {
        "type": "object",
        "auto_persist": True,
        "sync_to": "USER.md",
        "default": {"name": "", "preferences": [], "communication_style": "", "known_facts": []},
    },
    "session_notes": {
        "type": "string",
        "auto_persist": False,
        "default": "",
    },
    "skill_registry": {
        "type": "object",
        "auto_persist": True,
        "sync_to": "registry.json",
        "default": {},
    },
    "memory_snapshot": {
        "type": "string",
        "auto_persist": True,
        "sync_to": "MEMORY.md",
        "default": "",
    },
    "last_search_results": {
        "type": "array",
        "ephemeral": True,
        "default": [],
    },
    "pending_tasks": {
        "type": "array",
        "ephemeral": True,
        "default": [],
    },
}


def _ensure():
    VAR_DIR.mkdir(parents=True, exist_ok=True)
    if not PERSISTENT_FILE.exists():
        defaults = {name: conf["default"] for name, conf in VARIABLE_DEFS.items() if not conf.get("ephemeral")}
        PERSISTENT_FILE.write_text(json.dumps(defaults, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_persistent() -> dict[str, Any]:
    _ensure()
    try:
        return json.loads(PERSISTENT_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_persistent(data: dict[str, Any]):
    _ensure()
    PERSISTENT_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def variable_get(name: str) -> Any:
    conf = VARIABLE_DEFS.get(name)
    if not conf:
        return None
    if conf.get("ephemeral"):
        return _ephemeral.get(name, conf["default"])
    data = _load_persistent()
    return data.get(name, conf["default"])


def variable_set(name: str, value: Any) -> dict:
    conf = VARIABLE_DEFS.get(name)
    if not conf:
        return {"success": False, "error": f"未知变量 '{name}'"}

    if conf.get("ephemeral"):
        _ephemeral[name] = value
        return {"success": True, "persisted": False}

    data = _load_persistent()
    data[name] = value
    _save_persistent(data)

    if conf.get("auto_persist"):
        _sync_to_file(name, value, conf)

    return {"success": True, "persisted": True}


def variable_delete(name: str) -> dict:
    conf = VARIABLE_DEFS.get(name)
    if not conf:
        return {"success": False, "error": f"未知变量 '{name}'"}
    if conf.get("ephemeral"):
        _ephemeral.pop(name, None)
        return {"success": True}
    data = _load_persistent()
    data.pop(name, None)
    _save_persistent(data)
    return {"success": True}


def variable_list() -> list[dict]:
    results = []
    for name, conf in VARIABLE_DEFS.items():
        val = variable_get(name)
        results.append({
            "name": name,
            "type": conf["type"],
            "ephemeral": conf.get("ephemeral", False),
            "auto_persist": conf.get("auto_persist", False),
            "value": val,
        })
    return results


def variable_persist(name: str) -> dict:
    conf = VARIABLE_DEFS.get(name)
    if not conf:
        return {"success": False, "error": f"未知变量 '{name}'"}
    if not conf.get("ephemeral"):
        return {"success": True}
    val = _ephemeral.get(name, conf["default"])
    return variable_set(name, val)


def _sync_to_file(name: str, value: Any, conf: dict):
    target = conf.get("sync_to", "")
    if not target:
        return
    try:
        from ..services.memory import MEMORY_DIR
        from ..services.skill import SKILLS_DIR
        if target == "USER.md":
            path = MEMORY_DIR.parent / "USER.md"
            yaml_content = f"---\nname: {value.get('name', '')}\npreferences: {json.dumps(value.get('preferences', []), ensure_ascii=False)}\ncommunication_style: {value.get('communication_style', '')}\n---\n"
            path.write_text(yaml_content, encoding="utf-8")
        elif target == "MEMORY.md":
            path = MEMORY_DIR.parent / "MEMORY.md"
            path.write_text(f"# MEMORY\n\n{value}\n", encoding="utf-8")
        elif target == "registry.json":
            path = SKILLS_DIR / "registry.json"
            if isinstance(value, dict):
                path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass
