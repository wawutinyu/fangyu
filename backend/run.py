"""
fangyu 应用启动脚本
====================
用法：py run.py
      或 uvicorn app.main:app --reload --port 8000

功能：读取 .env 配置，启动 uvicorn 开发服务器（带热重载）。
      生产环境建议直接使用 uvicorn 命令 + systemd/supervisor 管理进程。
"""

import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,  # 热重载：代码修改后自动重启
    )
