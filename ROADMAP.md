# Fangyu Flow Canvas 发展规划

## 已完成
- [x] composite-node 子图执行（递归 run_flow）
- [x] loop 节点真正执行循环体（inner_nodes 子图）
- [x] search 节点接真实搜索（Bing + arXiv）
- [x] search.source 配置（web/news/academic）
- [x] condition.branch_count 动态端口
- [x] input/output 节点加入前端库
- [x] 组合/循环体子编辑器（SubFlowEditor）
- [x] 废弃的配置字段后端消费（min_score / var_value / strict）

## 规划中（待实现）

### 1. Agent 节点（高优先级）
**目标**: 把 LLM + tool-call + memory 打包成一个 Agent 节点
- 自带 system prompt 定义角色
- 自动循环调用 LLM → 解析工具调用 → 执行 → 继续直到完成
- 可配置 max_iterations / tools 白名单
- 内部复用已有的 tool-call 和 LLM 执行器
- Agent 节点可以嵌套（Agent 调用另一个 Agent）

**设计思路**:
```
Agent 节点配置:
- system_prompt: Agent 角色定义
- tools: 可用工具列表（全部/白名单）
- max_iterations: 最大推理步数
- memory: 是否自动维护会话记忆

执行流程:
1. 拼接 system_prompt + 历史 + 用户输入 → 调用 LLM
2. 解析 LLM 输出
   - 如果包含工具调用 → 执行工具 → 回到步骤 1
   - 如果是最终回答 → 返回结果
3. 超过 max_iterations → 强制返回
```

### 2. 独立可执行导出（中优先级）
**目标**: 把 flow 导出为一个独立可运行的 Python 脚本
- 编译 flow 为 flat Python 代码
- 不需要 Fangyu 运行时，只用标准库 + httpx
- 支持环境变量配置 API key
- 导出为单文件 `.py`，可以 `python flow.py` 直接运行

**设计思路**:
```
exporter.py
- 拓扑排序节点
- 为每个节点生成一个 async def node_X() 函数
- 节点间通过函数调用串联
- LLM 节点 → 直接 httpx 调用 API
- 条件/分支 → if/else
- 循环 → for 循环
- 工具调用 → 内联代码
```

### 3. 真·循环体执行（低优先级）
- 循环节点支持在配置中引用画布上选中的节点作为循环体
- 可视化选择哪些节点属于循环体
- 每个迭代重新执行体节点

### 4. 画布性能优化（低优先级）
- 虚拟化节点渲染（超过 50 节点时）
- 增量保存
- 撤回栈优化
