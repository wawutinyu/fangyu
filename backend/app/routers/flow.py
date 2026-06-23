"""
fangyu 流程执行业务层
=====================
功能：接收前端提交的流程数据，拓扑排序后依次执行每个节点。
       当前为骨架代码，执行引擎将从前端的 executor.js 迁移至此。

业务流程：
1. 前端调用 POST /api/v1/flow/execute
2. 请求体包含：flow_data（节点/边数据）+ external_inputs（用户输入）
3. 后端执行引擎拓扑排序 → 遍历节点 → 调用 LLM/代码/HTTP 等
4. 返回执行结果和详细日志

迁移计划（从前端 executor.js 迁移至此处）：
- Phase 1（当前）：接收流程数据，返回 mock 结果。
- Phase 2：将 executor.js 的 _executeNode 逻辑迁移至此。
- Phase 3：添加流式响应（SSE）支持，逐节点返回执行结果。
- Phase 4：添加代码沙箱（docker/subprocess）支持。

注意事项：
- 执行引擎是 CPU 密集型操作，长流程建议使用 BackgroundTasks。
- LLM API 调用建议设置超时（默认 30s），避免请求挂起。
- 执行结果需包含每个节点的输入/输出，用于前端展示运行日志。
- 流式响应格式：data: {"nodeId":"...","type":"start|complete|error","data":{}}\n\n
"""

from fastapi import APIRouter

# Router 实例
# prefix 所有接口统一以 /api/v1/flow 开头，版本化管理。
# tags 用于 FastAPI 自动生成 OpenAPI 文档的分组。
router = APIRouter(prefix="/api/v1/flow", tags=["流程执行"])


@router.post("/execute")
async def execute_flow():
    """
    执行流程
    =========
    接收前端提交的完整流程数据（节点+边+外部输入），
    执行引擎处理后返回运行结果。

    当前状态：骨架代码，返回 mock 结果。
    后续实现：
    - 从请求体中解析 flow_data 和 external_inputs。
    - 拓扑排序确定执行顺序。
    - 遍历执行每个节点（LLM/代码/HTTP/条件判断等）。
    - 收集每个节点的输入/输出日志。
    - 返回结构化结果供前端展示。

    请求体格式（后续实现）：
    {
        "flow_data": {"nodes": [...], "edges": [...]},
        "external_inputs": {"query": "用户消息"},
        "global_vars": {"_chatHistory": [...]}
    }

    响应格式：
    {
        "success": true,
        "results": [
            {"nodeId": "...", "nodeName": "LLM", "type": "llm", "outputs": {...}}
        ],
        "logs": [
            {"nodeId": "...", "nodeName": "...", "type": "start|complete|error", "data": {...}}
        ]
    }

    HTTP 状态码：
    - 200: 执行成功（即使节点执行失败，只要引擎未崩溃就返回 200）。
    - 400: 请求体格式错误（缺少必要字段）。
    - 500: 引擎内部错误（严重异常）。

    注意事项：
    - LLM 调用失败不应导致整个流程终止（将错误节点标记为失败继续执行）。
    - 长时间运行的流程（>30s）建议切换为流式响应。
    """
    return {
        "success": True,
        "results": [],
        "logs": [],
    }
