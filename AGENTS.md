# fangyu — AI Flow Canvas

可视化 AI 工作流编排工具，对标 Dify/Coze。

## 项目结构（前后端分离）

```
.
├── frontend/               # Vue 3 + Vite + LogicFlow
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   ├── stores/         # Pinia 状态管理
│   │   ├── plugins/        # LogicFlow 自定义节点/边
│   │   └── utils/          # 工具函数
│   ├── index.html
│   ├── package.json
│   └── vite.config.js      # 含 /api 代理到后端 8000
│
├── backend/                # Python + FastAPI
│   ├── app/
│   │   ├── main.py         # 应用入口 + 路由注册
│   │   ├── core/config.py  # 集中配置（.env + 环境变量）
│   │   ├── models/         # SQLAlchemy 数据模型
│   │   └── routers/        # API 路由（flow/llm/settings）
│   ├── run.py              # 开发启动脚本
│   └── requirements.txt
│
├── dev.bat                 # 一键启动前后端（热重载）
├── AGENTS.md
└── .gitignore
```

## 开发启动

```bash
# 方式一：一键启动（推荐）
dev.bat

# 方式二：分别启动
cd backend && py run.py          # 后端 http://localhost:8000
cd frontend && npm run dev        # 前端 http://localhost:5173
```

两个服务都是热重载的——改代码后自动刷新。

## API 设计

版本化：`/api/v1/{resource}/{action}`

| 端点 | 说明 | 状态 |
|------|------|------|
| `GET /api/health` | 健康检查 | ✅ |
| `POST /api/v1/flow/execute` | 执行流程 | ⬜ 骨架 |
| `POST /api/v1/llm/chat` | LLM 聊天代理 | ⬜ 骨架 |
| `GET /api/v1/llm/models` | 模型列表 | ✅ 静态 |
| `GET /api/v1/settings/` | 获取设置 | ⬜ 骨架 |
| `PUT /api/v1/settings/` | 保存设置 | ⬜ 骨架 |

## 后续计划

- [ ] 把前端 executor.js 的执行引擎迁移到后端
- [ ] 实现 LLM API 代理（SSE 流式响应）
- [ ] 知识库上传 + RAG
- [ ] 代码沙箱执行
- [ ] 项目 CRUD 对接数据库
- [ ] 设置存储对接数据库
- [ ] Electron/Tauri 桌面版打包

## 给 AI 的注意事项

- 所有 API Key 只能存在于后端，前端通过后端代理调用 LLM
- 数据库使用 SQLite + aiosqlite（异步），换 PG 只需改连接字符串
- 前端 settingsStore 最终要改为调用后端 API，不再存 localStorage
- 热启动脚本 dev.bat 用 start 命令开新窗口，关闭窗口自动杀进程
