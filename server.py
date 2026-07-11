"""Fangyu FastAPI server"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .models.database import init_db

from .routers import flow as flow_router
from .routers import llm as llm_router
from .routers import settings as settings_router
from .routers import knowledge as knowledge_router
from .routers import project as project_router
from .routers import memory as memory_router
from .routers import search as search_router
from .routers import tools as tools_router
from .routers import skills as skills_router
from .routers import variables as variables_router
from .routers import monitor as monitor_router
from .routers import export_compile as export_router
from .routers import trigger as trigger_router
from .routers import mcp as mcp_router
from .routers import a2a as a2a_router
from .routers import trust as trust_router
from .routers import constitution as constitution_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    from .engine.mcp import _init_internal_tools
    await _init_internal_tools()
    yield


app = FastAPI(
    title="fangyu API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
app.include_router(constitution_router.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
