"""从 Studio 设置库（data/fangyu.db）补齐环境变量中的 API Key。

用户通常在 Studio 设置里填 Key，不会单独建 .env；CLI / live 脚本需读同一来源。
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

_KEY_MAP = {
    "deepseek_api_key": "DEEPSEEK_API_KEY",
    "openai_api_key": "OPENAI_API_KEY",
    "anthropic_api_key": "ANTHROPIC_API_KEY",
}


def default_settings_db() -> Path:
    override = os.getenv("FANGYU_DATA_DIR")
    if override:
        return Path(override) / "fangyu.db"
    # fangyu/core/credentials.py → 项目根
    root = Path(__file__).resolve().parent.parent
    return root / "data" / "fangyu.db"


def hydrate_api_keys_from_db(db_path: Path | None = None) -> dict[str, str]:
    """若环境变量未设，从 settings 表写入 os.environ。返回已补齐的 env 名。"""
    path = Path(db_path) if db_path else default_settings_db()
    filled: dict[str, str] = {}
    if not path.is_file():
        return filled
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.Error:
        return filled
    try:
        rows = con.execute(
            "SELECT key, value FROM settings WHERE key LIKE '%_api_key'"
        ).fetchall()
    except sqlite3.Error:
        return filled
    finally:
        con.close()

    for key, value in rows:
        env_name = _KEY_MAP.get(str(key or "").strip().lower())
        if not env_name or not (value or "").strip():
            continue
        if os.getenv(env_name):
            continue
        os.environ[env_name] = str(value).strip()
        filled[env_name] = "db"

    return filled


def refresh_settings_object() -> None:
    """同步 fangyu.core.config.settings 上的 Key 字段。"""
    try:
        from fangyu.core import config as config_mod
    except Exception:
        return
    s = config_mod.settings
    s.OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "") or s.OPENAI_API_KEY
    s.DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "") or s.DEEPSEEK_API_KEY
    s.ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "") or s.ANTHROPIC_API_KEY


def ensure_api_keys() -> bool:
    """dotenv 之后调用：DB 补齐 + 刷新 Settings。有任一 Key 则 True。"""
    hydrate_api_keys_from_db()
    refresh_settings_object()
    return bool(
        os.getenv("DEEPSEEK_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or os.getenv("ANTHROPIC_API_KEY")
    )
