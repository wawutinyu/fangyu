# 测试

```
tests/
├── python/          # Python 单元/集成测试（pytest）
└── (fangyu-flow/)   # 前端测试在 fangyu-flow/ 内
    ├── src/utils/__tests__/   # Vitest 单元测试
    └── e2e/                   # Playwright E2E
```

## 运行

```bash
# Python 测试（无需启动服务）
py -m pip install -e .
py -m pytest tests/python/ -v

# 前端单元测试
cd fangyu-flow && npm test

# API 集成测试（需先启动后端）
py -m fangyu --server
py tests/python/check_all_features_api.py

# E2E
cd fangyu-flow && npm run test:e2e
```
