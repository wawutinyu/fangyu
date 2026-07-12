# 测试

```
tests/
├── unit/            # Python 单元测试（pytest，无需启动服务）
├── integration/     # Python 集成测试（需启动 API 服务）
├── fangyu-canvas/   # Vitest 单元测试
└── fangyu-studio/   # Playwright E2E（方隅·序）
```

## 运行

```bash
# 单元测试（含节点全覆盖 + 数据传递回归）
py -m pip install -e .
py -m pytest tests/unit/ -v

# 仅节点执行与数据传递
py -m pytest tests/unit/test_node_executors.py tests/unit/test_data_passing.py -v

# 集成测试（需先启动后端）
py -m fangyu --server
py tests/integration/check_all_features_api.py

# 全部 Python 测试
py -m pytest tests/ -v

# 前端（项目根目录 npm install 一次）
npm run test -w fangyu-canvas          # 或 npm run test:fast -w fangyu-canvas
npm run test:e2e -w fangyu-studio
```
