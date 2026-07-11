"""
fangyu 系统设置模型
====================
功能：以 key-value 形式存储所有用户设置。
当前用途：存储各 LLM 提供商的 API Key、默认模型选择等。

设计原则：
- 使用简单的键值对模型，避免为每个设置项创建独立字段。
- 新增设置项无需修改数据库 schema，直接新增 key 即可。
- key 的命名规则：`{provider_id}_{setting_name}`。
  例如：`openai_api_key`、`deepseek_api_key`、`active_provider`。

与 settingsStore（前端）的关系：
- 前端 settingsStore 在用户保存设置时调用 PUT /api/v1/settings/，
  将整个配置对象展开为 key-value 对写入此表。
- 前端启动时调用 GET /api/v1/settings/ 读取所有配置，还原为配置对象。

注意事项：
- 值统一使用 Text 类型，数值/布尔值在业务层做类型转换。
- API Key 以明文存储在数据库（SQLite 文件层面无加密）。
  后续需加 AES 加密存储（桌面版尤其重要）。
- 不要在此表中存储会话级或临时数据。
"""

from sqlalchemy import Column, String, Text
from .database import Base


class Setting(Base):
    """
    系统设置模型
    =============
    通用 key-value 存储表。
    每行代表一个配置项，key 作为主键（唯一约束）。

    字段说明：
    - key: 配置键名，采用小写加下划线命名（如 'openai_api_key'）。
    - value: 配置值，统一存储为字符串。
            前端读取后根据业务逻辑做类型转换（str→int/bool）。

    已知 key 列表：
    | key | 示例值 | 说明 |
    |-----|--------|------|
    | openai_api_key | sk-xxxx | OpenAI API Key |
    | openai_base_url | https://api.openai.com/v1 | OpenAI 接口地址 |
    | deepseek_api_key | sk-xxxx | DeepSeek API Key |
    | deepseek_base_url | https://api.deepseek.com | DeepSeek 接口地址 |
    | anthropic_api_key | sk-ant-xxxx | Anthropic API Key |
    | active_provider | openai | 当前激活的提供商 |
    | default_model | gpt-4o | 默认使用模型 |

    扩展方式：
    前端 settingsStore 中新增配置项后，保存时自动写入此表，
    无需修改后端代码（前提是后端已经实现了批量 PUT 接口）。
    """

    __tablename__ = "settings"

    key = Column(String(64), primary_key=True)
    """配置键名：主键，不区分大小写（统一小写）。"""

    value = Column(Text, default="")
    """配置值：统一使用字符串存储，类型转换由业务层处理。"""
