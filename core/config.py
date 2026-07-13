import os
from pathlib import Path

from dotenv import load_dotenv

# fangyu/ 即项目根目录
PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
_data_dir_override = os.getenv("FANGYU_DATA_DIR")
DATA_DIR: Path = Path(_data_dir_override) if _data_dir_override else PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(PROJECT_ROOT / ".env")


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


settings = Settings()
