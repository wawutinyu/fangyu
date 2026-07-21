import json
import re
import time
from pathlib import Path
from typing import Any

SKILLS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "skills"
REGISTRY_FILE = SKILLS_DIR / "registry.json"


def _ensure():
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    if not REGISTRY_FILE.exists():
        REGISTRY_FILE.write_text("[]", encoding="utf-8")


def _resolve_under(root: Path, *parts: str) -> Path:
    """将相对片段解析到 root 下；拒绝 .. / 绝对路径穿越。"""
    root_r = root.resolve()
    if not parts:
        raise ValueError("empty path")
    for part in parts:
        if part is None or str(part).strip() == "":
            raise ValueError("invalid path segment")
        p = Path(str(part))
        if p.is_absolute() or ".." in p.parts:
            raise ValueError("path escape rejected")
    target = root_r.joinpath(*[str(p) for p in parts]).resolve()
    if not target.is_relative_to(root_r):
        raise ValueError("path escape rejected")
    return target


def _registry() -> list[dict]:
    _ensure()
    try:
        data = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data.get("skills", [])
        if isinstance(data, list):
            return data
        return []
    except (json.JSONDecodeError, OSError):
        return []


def _save_registry(data: list[dict]):
    _ensure()
    REGISTRY_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def create_skill(name: str, description: str, content: str) -> dict:
    registry = _registry()
    if any(s["name"] == name for s in registry):
        return {"success": False, "error": f"技能 '{name}' 已存在"}

    try:
        file_path = _resolve_under(SKILLS_DIR, f"{name}.md")
    except ValueError as e:
        return {"success": False, "error": str(e)}

    entry = {
        "name": name,
        "description": description,
        "version": "1.0",
        "created": int(time.time()),
        "file": f"{name}.md",
    }
    file_path.write_text(content, encoding="utf-8")

    registry.append(entry)
    _save_registry(registry)
    return {"success": True, "skill": entry}


def edit_skill(name: str, content: str) -> dict:
    try:
        file_path = _resolve_under(SKILLS_DIR, f"{name}.md")
    except ValueError as e:
        return {"success": False, "error": str(e)}
    if not file_path.exists():
        return {"success": False, "error": f"技能 '{name}' 不存在"}
    file_path.write_text(content, encoding="utf-8")
    registry = _registry()
    for entry in registry:
        if entry["name"] == name:
            entry["version"] = str(float(entry.get("version", "1.0")) + 0.1)
            _save_registry(registry)
            return {"success": True, "skill": entry}
    return {"success": True}


def delete_skill(name: str) -> dict:
    registry = [s for s in _registry() if s["name"] != name]
    _save_registry(registry)
    try:
        file_path = _resolve_under(SKILLS_DIR, f"{name}.md")
    except ValueError as e:
        return {"success": False, "error": str(e)}
    if file_path.exists():
        file_path.unlink()
    return {"success": True}


def list_skills() -> list[dict]:
    return _registry()


def get_skill_content(name: str) -> str | None:
    try:
        file_path = _resolve_under(SKILLS_DIR, f"{name}.md")
    except ValueError:
        return None
    if file_path.exists():
        return file_path.read_text(encoding="utf-8")
    return None


def skill_write_file(skill_name: str, filename: str, content: str) -> dict:
    try:
        file_path = _resolve_under(SKILLS_DIR, skill_name, filename)
    except ValueError as e:
        return {"success": False, "error": str(e)}
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")
    return {"success": True, "path": str(file_path.relative_to(SKILLS_DIR.resolve()))}


def skill_remove_file(skill_name: str, filename: str) -> dict:
    try:
        file_path = _resolve_under(SKILLS_DIR, skill_name, filename)
    except ValueError as e:
        return {"success": False, "error": str(e)}
    if file_path.exists():
        file_path.unlink()
        return {"success": True}
    return {"success": False, "error": f"文件 '{filename}' 不存在于技能 '{skill_name}' 中"}


def learn_from_llm(llm_content: str) -> list[dict]:
    results = []
    pattern = re.compile(
        r'```(?:skill|markdown)\s*\n#\s*(.+?)\n(.*?)```',
        re.DOTALL,
    )
    for match in pattern.finditer(llm_content):
        name = match.group(1).strip()
        body = match.group(2).strip()
        desc = body.split("\n")[0] if body else name
        result = create_skill(name, desc, body)
        results.append(result)

    alt_pattern = re.compile(r'##\s*技能学习\s*\n###\s*(.+?)\n(.*?)(?=\n##|\Z)', re.DOTALL)
    for match in alt_pattern.finditer(llm_content):
        name = match.group(1).strip()
        body = match.group(2).strip()
        if not any(r.get("skill", {}).get("name") == name for r in results):
            desc = body.split("\n")[0] if body else name
            result = create_skill(name, desc, body)
            results.append(result)

    return results
