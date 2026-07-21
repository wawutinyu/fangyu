import os
from pathlib import Path
from typing import Callable

from dotenv import load_dotenv

# fangyu/ 即项目根目录
PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
_data_dir_override = os.getenv("FANGYU_DATA_DIR")
DATA_DIR: Path = Path(_data_dir_override) if _data_dir_override else PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(PROJECT_ROOT / ".env")

# Studio 设置库中的 Key（用户常在 UI 里配，不一定有 .env）
try:
    from fangyu.core.credentials import hydrate_api_keys_from_db

    hydrate_api_keys_from_db(DATA_DIR / "fangyu.db")
except Exception:
    pass

_data_dir_listeners: list[Callable[[Path], None]] = []


def on_data_dir_change(callback: Callable[[Path], None]) -> None:
    """注册 DATA_DIR 变更回调（如刷新宪法路径）。"""
    _data_dir_listeners.append(callback)


def set_data_dir(path: str | Path) -> Path:
    """运行时切换数据目录（Bundle 隔离用）。同步环境变量与监听者。"""
    global DATA_DIR
    DATA_DIR = Path(path).resolve()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    os.environ["FANGYU_DATA_DIR"] = str(DATA_DIR)
    for cb in list(_data_dir_listeners):
        try:
            cb(DATA_DIR)
        except Exception:
            pass
    return DATA_DIR


class Settings:
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    RELOAD: bool = os.getenv("RELOAD", "true").lower() == "true"
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{DATA_DIR / 'fangyu.db'}",
    )
    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:5174,http://localhost:5175,"
        "http://tauri.localhost,https://tauri.localhost,tauri://localhost,file://",
    ).split(",")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    ALLOW_DANGEROUS_TOOLS: bool = os.getenv("ALLOW_DANGEROUS_TOOLS", "false").lower() in ("1", "true", "yes")
    # 平台 A2A /send、/rpc 是否强制信封（默认关，避免打断旧客户端；序前端会主动签名）
    PLATFORM_REQUIRE_ENVELOPE: bool = os.getenv(
        "FANGYU_PLATFORM_REQUIRE_ENVELOPE", "0",
    ).lower() in ("1", "true", "yes")
    # S0：生产设 FANGYU_REQUIRE_AUTH=1；本地开发可保持默认关闭
    REQUIRE_AUTH: bool = os.getenv("FANGYU_REQUIRE_AUTH", "0").lower() in ("1", "true", "yes")
    # S0：匿名签发 JWT；生产务必 FANGYU_ALLOW_DEV_TOKEN=0
    # 空字符串表示「跟随 REQUIRE_AUTH 反义」——见 auth_gate.allow_dev_token
    ALLOW_DEV_TOKEN: str = os.getenv("FANGYU_ALLOW_DEV_TOKEN", "")


settings = Settings()
