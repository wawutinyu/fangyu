# Add Button 修复方案

## 问题根因
`+` 按钮和 Handle 共享同一个 DOM 区域，点击事件互相竞争。`+` 按钮的 `pointerEvents: none` 让事件穿透到 Handle 或被 React Flow 拦截。

## 目标效果
**添加模式**（工具栏切换）：
- 悬停节点 → 节点底部下方出现独立 `+` 按钮（跟 Handle 零重叠）
- 点击 `+` → 弹出 NodePicker（端口类型过滤后的合法节点列表）
- 选择节点 → 自动创建节点 + 连线

**连线模式**：
- Handle 正常拖拽连线，`+` 不显示

## 改动清单

### 1. AtomNode.tsx — 重构 SourceHandle
- 移除 SourceHandle 内嵌的覆盖层/事件拦截逻辑
- 在节点底部下方（AtomNode root div 内部、所有内容之后）渲染 `+` 按钮
- `+` 按钮条件：`portMode === 'add' && outPorts.length > 0`
- `+` 按钮样式：独立 div，`display: none` 默认，`:hover` 父节点时 `display: block`
- 不再需要 useRef / useEffect 做事件拦截

### 2. NodePicker.tsx — 端口兼容性过滤
按照 Dify `useAvailableBlocks` 的逻辑重构候选节点过滤：

**规则**：
1. 排除当前节点自身（不可自连）
2. 排除 target 端口已满的节点（inputSchema 中 required 端口数 ≤ 已有入边数）
3. 端口类型匹配：当前节点 outputSchema 的 type → 候选节点 inputSchema 的 type（any 通配所有）
4. 排除 `start`（不可做后续节点）

**实现**：
- `FlowCanvas.tsx` 的 `isValidConnection` 已有端口匹配逻辑 → 抽象为 `getCompatibleTargets(sourceNodeType)` 工具函数
- `NodePicker` 接收 `compatibleTypes: string[]` 代替当前粗糙的 `getValidTargets`

### 3. flowSlice.ts — portMode 已就绪
- 已有 `portMode` state + `setPortMode`，无需改动

### 4. TopToolbar.tsx — 已有切换按钮
- 已有 `portMode` props + 切换按钮，无需改动

### 5. CSS (global.css) — 新增 `+` 按钮样式
- 移除旧的 `.source-handle-group` / `.source-handle-add-icon`
- 新增 `.node-add-btn`：在节点底部下方，圆形 `+`，hover 显示

## 执行顺序
1. 写工具函数 `getCompatibleTargets`（端口匹配逻辑复用 isValidConnection）
2. 更新 `NodePicker.tsx` 接收 `compatibleTypes` 过滤
3. 重构 `AtomNode.tsx`：移除 SourceHandle 覆盖层，在节点底部加独立 `+` 按钮
4. 更新 `global.css`：替换样式
5. 编译验证
