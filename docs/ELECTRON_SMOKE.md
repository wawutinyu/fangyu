# Electron 桌面版冒烟验证

fangyu-flow 支持 Electron 打包。以下步骤用于验证「画布 + 内嵌后端 + 导出」基本可用。

## 前置

- Node.js 18+
- Python 3.12+（`py -m pip install -e .` 已在根目录执行）
- Windows / macOS / Linux

## 开发模式冒烟

```bash
# 根目录启动后端
py -m fangyu --server

# 另一终端 — fangyu-flow
cd fangyu-flow
npm install
npm run electron:dev
```

验证清单：

- [ ] 窗口打开，Flow 画布可拖拽节点
- [ ] Simulate 运行本地流程（宪法 warn/deny 弹窗可见）
- [ ] 设置 → 宪法 → 策略模板可一键添加
- [ ] Agent 编排 → 加载 AI 社会 Demo
- [ ] 导出 Python 代码对话框可生成代码

## 生产构建（可选）

```bash
cd fangyu-flow
npm run build
npm run electron:build
```

构建产物在 `fangyu-flow/release/`。

## 已知限制

- Electron 包内嵌 fangyu 源码，但 **data/** 与 API Key 需用户自行配置
- A2A 跨机器通信建议使用独立 `py -m fangyu --server`，参见 [A2A_REMOTE.md](A2A_REMOTE.md)
- export↔engine parity 测试在 CI 运行，桌面版不自动执行

## 自动化（CI 外本地）

```bash
cd fangyu-flow
npm run test:fast    # 快速单测（不含 parity subprocess）
npm run typecheck
npm run build
```
