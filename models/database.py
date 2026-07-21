"""
fangyu 数据库核心模块
======================
功能：SQLAlchemy 异步引擎初始化、会话管理、表创建。
设计原则：
- 所有数据库操作通过 async_session 提供的 AsyncSession 进行，禁止直接使用 engine。
- 表定义在各 model 文件中，通过 import 触发注册，确保 Base.metadata 感知所有表。

注意事项：
- 修改模型后不会自动迁移（SQLite 不支持 ALTER TABLE）。
- 开发阶段修改模型后，直接删除 data/fangyu.db 文件重新创建即可。
- 生产环境需使用 Alembic 做数据库迁移管理（后续集成）。
- aiosqlite 驱动要求所有数据库操作在异步上下文中执行。
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

# 从集中配置读取数据库连接字符串
# 注意：不使用默认的 SQLite 同步驱动（sqlite:///...），必须使用异步驱动。
from ..core.config import settings


# ---------------------------------------------------------------------------
# 异步引擎
# ---------------------------------------------------------------------------
# echo=False：生产环境不打印 SQL 日志。
# 调试时可临时改为 True 查看所有 SQL 语句（控制台输出）。
# 注意：在高并发下开启 echo 会显著降低性能。
engine = create_async_engine(settings.DATABASE_URL, echo=False)


# ---------------------------------------------------------------------------
# 异步会话工厂
# ---------------------------------------------------------------------------
# async_sessionmaker 每次调用返回一个新的 AsyncSession 实例。
# expire_on_commit=False：提交后不自动过期，后续仍可访问模型属性（懒加载需注意）。
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ---------------------------------------------------------------------------
# ORM 基类
# ---------------------------------------------------------------------------
# 所有数据库模型继承此类。
# declarative_base() 方式已废弃，改用 DeclarativeBase 类继承。
class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# 数据库初始化
# ---------------------------------------------------------------------------


async def init_db():
    """
    应用启动时调用，负责：
    1. 导入所有模型模块（确保它们在 Base.metadata 中注册）。
    2. 调用 create_all 创建不存在的表。

    调用时机：app/main.py 的 lifespan 启动事件中。
    幂等性：create_all 内部检查表是否存在，重复调用安全。

    注意事项：
    - 不会修改已存在的表结构（字段变更需通过 Alembic 迁移）。
    - 导入顺序不重要，SQLAlchemy 会自动处理表间依赖。
    - 如果模型文件新增，必须在这里显式 import 触发注册。
    """
    # 延迟导入避免循环依赖
    # 每个 model 文件通过定义继承 Base 的类来注册到 Base.metadata
    from .project import Project, Save  # noqa: F401
    from .setting import Setting  # noqa: F401
    from .knowledge import KnowledgeDoc, KnowledgeChunk  # noqa: F401
    from .memory import MemoryFact  # noqa: F401
    from .execution_log import ExecutionLog  # noqa: F401
    from .conversation import ConversationLog  # noqa: F401
    from .asset import Asset  # noqa: F401
    from .trace_log import TraceLog  # noqa: F401

    async with engine.begin() as conn:
        # run_sync：在异步连接中执行同步的 create_all
        # SQLite 的 DDL 操作不支持异步，需要通过此方式桥接
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_sqlite_columns)


def _ensure_sqlite_columns(sync_conn) -> None:
    """SQLite 无自动迁移：为已有表补列。"""
    try:
        rows = sync_conn.exec_driver_sql("PRAGMA table_info(execution_logs)").fetchall()
        cols = {r[1] for r in rows}
        if "trace_id" not in cols:
            sync_conn.exec_driver_sql(
                "ALTER TABLE execution_logs ADD COLUMN trace_id VARCHAR(64) DEFAULT ''"
            )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 数据库会话依赖
# ---------------------------------------------------------------------------


async def get_session():
    """
    FastAPI 依赖注入函数，为路由处理函数提供数据库会话。
    使用方式：

        @router.get("/items")
        async def get_items(db: AsyncSession = Depends(get_session)):
            ...

    yield 用法确保请求结束后自动关闭会话，归还连接到连接池。

    注意事项：
    - 每个请求独立获取一个新会话，不要跨请求共享。
    - 如果在事务中发生异常，FastAPI 会自动回滚（需配合 middleware）。
    - 桌面版单用户场景下，也可考虑使用单例会话以提高性能。
    """
    async with async_session() as session:
        yield session
