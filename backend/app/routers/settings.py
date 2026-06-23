"""
fangyu 系统设置 API
====================
功能：管理用户设置（API Key、模型选择、界面偏好等）。
       后端存储使用 settings 表（key-value 结构），
       前端通过此接口读写设置。

业务流程：
1. 前端启动时调用 GET /api/v1/settings/ 获取所有设置。
2. 用户在设置面板修改后调用 PUT /api/v1/settings/ 批量保存。
3. 后端将扁平化的 key-value 对存入 settings 表。

安全注意事项：
- API Key 在传输中使用 HTTPS 加密（生产环境必须配置 SSL）。
- 存储层面当前为明文，后续需加字段级 AES 加密。
- 桌面版打包后，建议使用操作系统的凭据管理器（如 Windows Credential Manager）。
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/settings", tags=["系统设置"])


@router.get("/")
async def get_settings():
    """
    获取所有设置
    =============
    返回所有用户设置的 key-value 列表。
    前端 settingsStore 初始化时调用此接口。

    响应格式：
    {
        "settings": {
            "openai_api_key": "sk-...",
            "deepseek_base_url": "https://api.deepseek.com",
            "active_provider": "openai",
            "default_model": "gpt-4o"
        }
    }

    注意事项：
    - 返回的 API Key 默认为 masked 格式（如 "sk-****abcd"），
      前端点击"显示"时再请求明文。
    - 不存在的 key 不会出现在返回对象中。
    """
    return {"settings": {}}


@router.put("/")
async def update_settings():
    """
    批量更新设置
    =============
    接收前端提交的完整设置对象，逐项写入 settings 表。
    前端 settingsStore.save() 时调用此接口。

    请求体格式：
    {
        "openai_api_key": "sk-xxxx",
        "active_provider": "openai",
        "default_model": "gpt-4o"
    }

    后续实现：
    1. 接收 JSON 对象，遍历所有 key-value。
    2. 对每个 key 执行 UPSERT（INSERT OR REPLACE）。
    3. 返回更新后的完整设置对象。

    UPSERT 示例（SQLite）：
    INSERT INTO settings (key, value) VALUES (:key, :value)
    ON CONFLICT(key) DO UPDATE SET value = :value
    """
    return {"success": True}
