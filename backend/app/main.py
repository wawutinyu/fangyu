"""
fangyu FastAPI 应用入口
========================
功能：FastAPI 应用实例创建、中间件注册、路由挂载、生命周期管理。
这是整个后端的入口文件，uvicorn 通过此模块启动应用。

启动方式：
    # 开发环境（热重载）
    uvicorn app.main:app --reload --port 8000

    # 生产环境
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

    # 或通过 run.py
    py run.py

应用生命周期：
    启动（lifespan startup）→ 接收请求 → 关闭（lifespan shutdown）
    - startup：初始化数据库连接池，创建表，加载配置。
    - shutdown：关闭数据库连接池，清理临时资源。

路由结构（版本化管理）：
    /api/health           → 健康检查（无版本前缀，用于负载均衡探测）
    /api/v1/flow/*        → 流程执行
    /api/v1/llm/*         → LLM 代理
    /api/v1/settings/*    → 系统设置
    /api/v1/projects/*    → 项目管理（后续添加）

桌面版适配注意事项：
    - 打包为 exe 后，lifespan 中的路径计算需调整。
    - CORS 配置应允许 file:// 协议或 localhost。
    - 数据库路径应改为用户数据目录（%APPDATA%/fangyu/）。
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 集中配置：所有环境变量和 .env 配置由此模块统一管理
from .core.config import settings

# 数据库初始化：异步引擎和会话工厂
from .models.database import init_db

# 路由模块：每个子模块对应一组相关 API 接口
from .routers import flow as flow_router              # POST /api/v1/flow/execute
from .routers import llm as llm_router                # POST /api/v1/llm/chat, GET /api/v1/llm/models
from .routers import settings as settings_router      # GET/PUT /api/v1/settings/
from .routers import knowledge as knowledge_router    # POST /api/v1/knowledge/*
from .routers import project as project_router        # /api/v1/projects/*
from .routers import memory as memory_router          # /api/v1/memory/*
from .routers import search as search_router          # /api/v1/search/*
from .routers import tools as tools_router            # /api/v1/tools/*
from .routers import skills as skills_router          # /api/v1/skills/*
from .routers import variables as variables_router    # /api/v1/variables/*
from .routers import monitor as monitor_router        # /api/v1/monitor/*
from .routers import export_compile as export_router  # /api/v1/export/*
from .routers import trigger as trigger_router        # /api/v1/trigger/*
from .routers import mcp as mcp_router                # /api/v1/mcp/*
from .routers import a2a as a2a_router                # /api/v1/a2a/*
from .routers import trust as trust_router            # /api/v1/trust/*


# ---------------------------------------------------------------------------
# 应用生命周期管理
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期上下文管理器。
    替代已废弃的 on_event("startup")/on_event("shutdown") 装饰器。

    startup 阶段（yield 之前）：
    - 初始化数据库连接池并创建表。
    - 如需加载缓存或预热连接，在此处完成。

    shutdown 阶段（yield 之后）：
    - 清理数据库连接池。
    - 关闭 HTTP 客户端会话（httpx.AsyncClient）。

    注意事项：
    - yield 之前的代码必须快速完成，否则会阻塞应用启动。
    - 如果 init_db() 失败，应用将无法启动（合理的默认行为）。
    """
    # -------------------- 启动 --------------------
    await init_db()   # 建表（幂等，重复调用安全）
    from .services.mcp import _init_internal_tools
    await _init_internal_tools()
    yield
    # -------------------- 关闭 --------------------
    # 后续在此处添加清理逻辑（如关闭连接池、停止后台任务）


# ---------------------------------------------------------------------------
# FastAPI 应用实例
# ---------------------------------------------------------------------------

app = FastAPI(
    title="fangyu API",
    # 版本号：与前端版本一致，通过此 API 返回给前端校验兼容性
    version="1.0.0",
    # 生命周期管理
    lifespan=lifespan,
    # OpenAPI 文档 URL（生产环境可关闭）
    docs_url="/docs",       # Swagger UI：http://localhost:8000/docs
    redoc_url="/redoc",     # ReDoc：http://localhost:8000/redoc
)

# ---------------------------------------------------------------------------
# 中间件
# ---------------------------------------------------------------------------

# CORS 跨域配置
# 允许前端开发服务器（Vite 5173）跨域访问后端 API。
# 生产环境应限制为具体的部署域名。
# 桌面版打包后，需允许 file:// 协议或注入特定 origin。
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],     # 允许所有 HTTP 方法（GET/POST/PUT/DELETE 等）
    allow_headers=["*"],     # 允许所有请求头（包括 Authorization）
)

# ---------------------------------------------------------------------------
# 路由注册
# ---------------------------------------------------------------------------

# 添加路由前缀：所有 API 以 /api/v1/ 开头
# 如需新增 API 版本（如 v2），在此处添加新路由即可共存
app.include_router(flow_router.router)
app.include_router(llm_router.router)
app.include_router(settings_router.router)
app.include_router(knowledge_router.router)
app.include_router(project_router.router)
app.include_router(memory_router.router)
app.include_router(search_router.router)
app.include_router(tools_router.router)
app.include_router(skills_router.router)
app.include_router(variables_router.router)
app.include_router(monitor_router.router)
app.include_router(export_router.router)
app.include_router(trigger_router.router)
app.include_router(mcp_router.router)
app.include_router(a2a_router.router)
app.include_router(trust_router.router)


# ---------------------------------------------------------------------------
# 健康检查
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health():
    """
    健康检查接口
    =============
    用于负载均衡器（Nginx/K8s）和后端监控系统探测服务状态。
    不依赖数据库连接，即使数据库暂时不可用也返回 200，
    避免负载均衡器将节点摘除（数据库问题由具体接口报错）。

    响应格式：
    {"status": "ok", "version": "1.0.0"}

    HTTP 状态码：
    - 200：服务正常运行。
    - 503：服务正在关闭或不可用（极少出现）。
    """
    return {
        "status": "ok",
        "version": "1.0.0",
    }
