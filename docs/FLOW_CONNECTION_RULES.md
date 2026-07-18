# 流程画布连线规则

> 与实现同源：`fangyu-canvas/src/utils/connectionRules.ts` + `nodeRegistry.ts` 的 `canConnectTypes`。  
> 拖拽、`+` 菜单、「接到已有节点」、边中插入 **必须共用** 同一判定，禁止旁路。

## 硬规则

1. **不能自连**（同一节点 ID）
2. **同类型不能互连**（如 `llm → llm`）— 当前产品约定；若需多段 LLM，应先改规则再放开 UI
3. **`output` 无出边**；**`input` / `variable-get` 无入边**
4. 源必须有 `outputSchema`，目标必须有 `inputSchema`，且至少一对端口类型兼容（`any` 通配）
5. **目标端口独占**：同一 `targetHandle` 最多一条入边
6. **禁止环路**
7. 句柄 `__default` 规范化为 schema 首端口名
8. 面板与推荐列表 **只展示非 legacy** 节点（见 `LEGACY_TYPES`）

## 现行节点（应均可执行）

现行类型列表 = `getActiveNodeTypes()`；每个类型须在后端 `register_executor` 有实现。  
回归：`tests/unit/test_palette_executor_parity.py`。

## 改规则时 checklist

- [ ] 更新 `canConnectTypes` / `validateFlowConnection`
- [ ] 同步 vitest：`connectionRules.test.ts`
- [ ] 同步 e2e：`fangyu-studio/e2e/drag-connect.spec.ts`（至少覆盖「不该出现的 picker 项」）
- [ ] 更新本文
