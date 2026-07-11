"""
fangyu 项目与保存历史模型
==========================
功能：定义项目（Project）和保存历史（Save）两个核心数据模型。
数据流关系：
  Project 1 ──→ N Save
  一个项目包含多次保存记录，每次保存生成一条 Save 记录。

设计原则：
- 使用字符串 UUID 作为主键（不依赖数据库自增），方便前端生成后直接使用。
- create_at/updated_at 由数据库自动维护，应用层不手动设置。

迁移注意事项：
- SQLite 不支持 ALTER TABLE，新增字段需删表重建。
- 生产环境切换到 PostgreSQL 后，DateTime 类型行为一致。
- 索引仅在 project_id 上建立（按项目查询历史是最频繁的操作）。
"""

from sqlalchemy import Column, String, Text, DateTime, func
from .database import Base


class Project(Base):
    """
    项目模型
    =========
    代表一个独立的流程草稿。
    每个项目包含项目名、描述、以及多个保存历史版本（Save）。
    删除项目时，对应的所有 Save 记录应一并清理（由业务层处理）。

    字段说明：
    - id: 前端生成的短 UUID（如 "p_a1b2c3d4"），不依赖数据库自增。
    - name: 项目显示名称，允许重复（同名不同项目）。
    - description: 项目描述/备注（Markdown 格式）。
    - created_at: 数据库自动写入的创建时间。
    - updated_at: 数据库自动更新的修改时间（SQLite 需 ON UPDATE 触发器支持）。

    注意事项：
    - name 使用 VARCHAR(255)，不限制更长的名称（前端自行截断）。
    - 删除项目时，请同时调用 Save 的级联删除。
    """

    __tablename__ = "projects"

    id = Column(String(32), primary_key=True)
    """主键：短 UUID（如 'p_a1b2c3d4'），前端 generateId() 生成。"""

    name = Column(String(255), nullable=False, default="未命名项目")
    """项目名：不可为空，默认"未命名项目"。"""

    description = Column(Text, default="")
    """项目描述：可选，Markdown 格式，可为空字符串。"""

    created_at = Column(DateTime, server_default=func.now())
    """创建时间：数据库写入时自动设置，应用层不应修改。"""

    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    """修改时间：每次更新记录时自动刷新，无需应用层手动维护。"""


class Save(Base):
    """
    保存历史模型
    =============
    代表项目的一次保存快照。
    每次用户点击保存（Ctrl+S）时生成一条 Save 记录。
    保存的内容是整个流程的完整 JSON 数据。

    字段说明：
    - id: 前端生成的短 UUID（如 "s_x1y2z3w4"）。
    - project_id: 所属项目 ID，外键关联 Project。
    - name: 保存名称（用户输入，如"保存 1"）。
    - flow_data: 完整流程数据的 JSON 字符串。
    - created_at: 保存时间（等同于快照时间）。

    查询模式：
    - 按 project_id 查询某个项目的所有历史版本（按时间倒序）。
    - 按 id 精确查询某个版本并恢复。

    flow_data 格式：
    由 frontend/src/utils/flowHelper.js 的 convertToExportFormat() 生成：
    {
      "nodes": [...],
      "links": [...],
      "flow_id": "",
      "flow_name": ""
    }

    数据量预估：
    - 单次保存平均 2-10 KB（视节点数量而定）。
    - 单项目 100 次保存约 1 MB，SQLite 完全可承受。
    """

    __tablename__ = "saves"

    id = Column(String(32), primary_key=True)
    """主键：短 UUID（如 's_x1y2z3w4'）。"""

    project_id = Column(String(32), nullable=False, index=True)
    """
    外键：所属项目 ID。
    index=True 创建索引，优化"按项目查询历史"的性能。
    注意：SQLite 不支持外键约束（需 PRAGMA foreign_keys=ON），
    关联完整性由业务层保证。
    """

    name = Column(String(255), nullable=False)
    """保存名称：用户自定义，不可为空。"""

    flow_data = Column(Text, default="{}")
    """
    流程数据：完整的流程 JSON 字符串。
    包含所有节点、连线、配置的快照。
    恢复流程时直接将此数据传给 convertFromExportFormat()。
    """

    created_at = Column(DateTime, server_default=func.now())
    """保存时间：等同于快照生成时间，用于历史版本排序。"""
