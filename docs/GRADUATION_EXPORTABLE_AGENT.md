# 本机毕业：可导出的 OpenCode / WorkBuddy 级 Agent

> 方隅的目的是 **批量、快速产出高质量 Agent 的平台**。  
> 本机毕业 ≠ Studio 好用，而是：**用平台搭出并能导出**达到 OpenCode harness / WorkBuddy 档的独立智能体。

关联：[愿景](VISION_AND_PRODUCT.md) · [评估](PROJECT_ASSESSMENT.md) · [L1 路线图](L1_ROADMAP.md)

---

## 毕业标准（硬）

你自己（或另一个人）做到：

1. `python -m fangyu bundle create --profile opencode --dest <dir> --workspace <repo>`
2. `python -m fangyu bundle chat <dir> --workspace <repo> -m "…真实任务…"`
3. Agent **多轮**使用工具完成任务；改动出现在绑定仓库里
4. 会话落在 `<repo>/.fangyu/chat.jsonl`
5. 危险命令被拦；包内宪法生效
6. 同一 create 命令可再吐变体包
7. （P1 剩余）有 Key 的 live 验收脚本绿灯

**当前进度：** A 已落地（chat + workspace 绑定）；B 真模型三用例仍待。

---

## 本机用法（毕业路径 A）

```bash
python -m fangyu bundle create --profile opencode --dest ~/tmp/oc --name OC \
  --workspace ~/Projects/some-repo

python -m fangyu bundle chat ~/tmp/oc --workspace ~/Projects/some-repo \
  -m "在 README 末尾加一节 Fangyu Harness"

# 或交互
python -m fangyu bundle chat ~/tmp/oc --workspace ~/Projects/some-repo
```

---

## 地基支柱（P0）

| ID | 支柱 | 验收一句话 |
|----|------|------------|
| P0-1 | Bundle 运行时 `DATA_DIR` 闭环 | 清宿主 `data/` 后同包行为不变；宪法从包内加载 |
| P0-2 | 导出闭包（tools/skills） | 无 Studio 也能执行声明技能 |
| P0-3 | 真 Agentic Loop | 单测：≥2 轮 tool 回灌后结束 |
| P0-4 | Coding 手脚进包 | 对指定 repo 完成读→改→跑最小任务 |
| P0-5 | 工厂 CLI/API | `profile → bundle` 无点画布；OpenCode 集成测绿 |

P0 未完成前：场景模板、观/空画布 polish、未验证 seed Agent **不计入毕业进度**。

---

## 已知空洞（勿当已完成）

- 固定 action loop ≠ agentic loop  
- Bundle 根目录 `constitution.json` 曾只是快照，执行曾读宿主 `DATA_DIR`（P0-1 要修）  
- Skills / MCP / tool_registry 默认不进包  
- Worker 是平台远端肢体，不是导出 Agent  
- Seed「OpenCode」等未经验证 export→真行为  

---

## 进度

| 项 | 状态 |
|----|------|
| 文档对齐毕业线 | ✅ |
| P0 地基（DATA_DIR / loop / tools / 工厂） | ✅ |
| **A：bundle chat + --workspace** | ✅ |
| B：真 Key 三用例 live 脚本 | 待办 |
| C：验收清单人工打勾 | 待办 |

*版本：2026-07-18*
