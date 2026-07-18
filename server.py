"""Fangyu FastAPI server"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import settings
from .core.exceptions import ConstitutionError, FangyuError, TrustError
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
from .routers import bundle as bundle_router
from .routers import adapters as adapters_router
from .routers import assets as assets_router
from .routers import workers as workers_router
from .routers import intent as intent_router
from .routers import presence as presence_router
from .routers import setup as setup_router
from .routers import scenario as scenario_router
from .routers import im as im_router
from .routers import managed as managed_router
from .routers import acl as acl_router
from .routers import materials as materials_router
from .routers import approvals as approvals_router
from .routers import mcp_http as mcp_http_router
from .routers import auth as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    from .engine.mcp import _init_internal_tools
    await _init_internal_tools()
    from .models.database import async_session
    from .core.asset_seed import maintain_asset_library
    from .core.worker_store import init_store
    from .core.platform_identity import ensure_platform_identity
    init_store()
    ensure_platform_identity()
    from .core.worker_mqtt_bridge import get_worker_mqtt_bridge
    get_worker_mqtt_bridge().start()
    async with async_session() as session:
        await maintain_asset_library(session)
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


@app.middleware("http")
async def auth_principal_middleware(request: Request, call_next):
    """Bearer JWT → ACL principal；SSO 关闭时允许 X-Fangyu-Principal 旁路。"""
    from fangyu.core.org_acl import reset_principal, set_principal
    from fangyu.core.sso import (
        load_sso_config,
        principal_from_payload,
        verify_access_token,
    )

    request.state.principal_id = None
    request.state.auth_payload = None
    cfg = load_sso_config()
    principal = None
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        raw = auth.split(" ", 1)[1].strip()
        try:
            payload = verify_access_token(raw, config=cfg)
            principal = principal_from_payload(payload)
            request.state.auth_payload = payload
        except ValueError:
            if cfg.get("enabled"):
                return JSONResponse(status_code=401, content={"detail": "invalid or expired token"})
    if not principal and not cfg.get("enabled"):
        bypass = (request.headers.get("x-fangyu-principal") or "").strip()
        if bypass:
            principal = bypass
    token = set_principal(principal) if principal else None
    if principal:
        request.state.principal_id = principal
    try:
        return await call_next(request)
    finally:
        if token is not None:
            reset_principal(token)


@app.exception_handler(FangyuError)
async def fangyu_error_handler(_request: Request, exc: FangyuError):
    status = 403 if isinstance(exc, (ConstitutionError, TrustError)) else 400
    return JSONResponse(status_code=status, content=exc.to_dict())


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
app.include_router(bundle_router.router)
app.include_router(adapters_router.router)
app.include_router(assets_router.router)
app.include_router(workers_router.router)
app.include_router(intent_router.router)
app.include_router(presence_router.router)
app.include_router(setup_router.router)
app.include_router(scenario_router.router)
app.include_router(im_router.router)
app.include_router(managed_router.router)
app.include_router(acl_router.router)
app.include_router(materials_router.router)
app.include_router(approvals_router.router)
app.include_router(mcp_http_router.router)
app.include_router(auth_router.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
