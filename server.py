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
    try:
        from .core.auth_gate import require_auth
        from .core.org_acl import enable_acl, load_acl

        # S0-A3：强制鉴权时默认开启 ACL + require_principal
        if require_auth():
            doc = load_acl()
            if not doc.get("enabled") or not doc.get("require_principal"):
                enable_acl(True, require_principal=True)
    except Exception:
        pass
    try:
        from .core.factory_heartbeat_loop import maybe_autostart_from_env
        maybe_autostart_from_env()
    except Exception:
        pass
    yield
    try:
        from .core.factory_heartbeat_loop import stop_factory_heartbeat_loop
        stop_factory_heartbeat_loop()
    except Exception:
        pass


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
    """Bearer JWT → ACL principal；可选强制鉴权（S0）。"""
    from fangyu.core.auth_gate import (
        allow_principal_header_bypass,
        is_public_route,
        require_auth,
    )
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
            if cfg.get("enabled") or require_auth():
                return JSONResponse(status_code=401, content={"detail": "invalid or expired token"})
    if not principal and not cfg.get("enabled") and allow_principal_header_bypass():
        bypass = (request.headers.get("x-fangyu-principal") or "").strip()
        if bypass:
            principal = bypass

    if require_auth() and not principal and not is_public_route(request.method, request.url.path):
        return JSONResponse(
            status_code=401,
            content={"detail": "未认证：需要 Authorization: Bearer <token>"},
        )

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


def _mount_studio_ui() -> None:
    """生产单进程：托管 fangyu-studio/dist（FANGYU_SERVE_UI=1 或目录存在且显式开启）。"""
    import os
    from pathlib import Path

    flag = (os.getenv("FANGYU_SERVE_UI") or "").strip().lower()
    if flag not in ("1", "true", "yes", "on"):
        return
    dist = Path(os.getenv("FANGYU_UI_DIST") or (Path(__file__).resolve().parent / "fangyu-studio" / "dist"))
    if not dist.is_dir() or not (dist / "index.html").is_file():
        return
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="studio-assets")

    @app.get("/")
    async def studio_index():
        return FileResponse(dist / "index.html")

    @app.get("/{full_path:path}")
    async def studio_spa(full_path: str):
        # API / docs 已由路由优先匹配；其余走静态或 SPA fallback
        if full_path.startswith("api/") or full_path in ("docs", "redoc", "openapi.json"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        candidate = dist / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")


_mount_studio_ui()
