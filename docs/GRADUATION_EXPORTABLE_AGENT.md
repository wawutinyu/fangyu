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
7. `python scripts/opencode_harness_live.py` 在配置 API Key 后三用例全绿

**当前进度：** A ✅ · B ✅ · C 自动项 ✅（`scripts/opencode_graduation_c.py`）；剩 C4 live 需 API Key。

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

## 毕业路径 B — Live 三用例

需要至少一个：`DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`。

```bash
export DEEPSEEK_API_KEY=sk-...
python scripts/opencode_harness_live.py
# 或
./scripts/opencode_harness_live.sh --keep   # 失败时保留临时目录
```

| 用例 | 期望 |
|------|------|
| write | 写出 `live_write.md` 含 `live-case-1` |
| search+patch | `seed.txt` 中 `REPLACE_ME` → `PATCHED` |
| shell | 写出 `live_shell.txt` 含 `live-case-3` |

退出码：`0` 全绿 · `1` 失败 · `2` 无 Key 跳过（不当假绿）。

---

## 毕业路径 C — 人手 + 自动验收

一键自动项（无 Key 也能跑 C1–C3/C5/C6；有 Key 顺带跑 C4）：

```bash
python scripts/opencode_graduation_c.py
```

| # | 项 | 自动脚本 | 结果 |
|---|----|----------|------|
| 1 | create + `--workspace` 指向 git 仓库 | ✅ | 脚本打勾 |
| 2 | `bundle chat` 完成小改动（可 git status） | ✅ mock | 脚本打勾 |
| 3 | `<repo>/.fangyu/chat.jsonl` 有会话 | ✅ | 脚本打勾 |
| 4 | live 脚本三用例绿（有 Key） | 有 Key 才跑 | ☐ 需你配 Key |
| 5 | 危险 shell 被拒 | ✅ | 脚本打勾 |
| 6 | 再 create 变体包仍可 chat | ✅ mock | 脚本打勾 |

**OpenCode 本机毕业条件：** `opencode_graduation_c.py` 全绿（含 C4），并建议在真实业务仓再人手 chat 一次。

WorkBuddy 竖切另开 profile。

---

## 地基支柱（P0）

| ID | 支柱 | 验收一句话 |
|----|------|------------|
| P0-1 | Bundle 运行时 `DATA_DIR` 闭环 | 清宿主 `data/` 后同包行为不变；宪法从包内加载 |
| P0-2 | 导出闭包（tools/skills） | 无 Studio 也能执行声明技能 |
| P0-3 | 真 Agentic Loop | 单测：≥2 轮 tool 回灌后结束 |
| P0-4 | Coding 手脚进包 | 对指定 repo 完成读→改→跑最小任务 |
| P0-5 | 工厂 CLI/API | `profile → bundle` 无点画布；OpenCode 集成测绿 |

---

## 已知空洞（仍诚实）

- 模型须遵守 JSON tool 协议（尚未原生 tools API）  
- 无 LSP；apply_patch 为简单字符串替换  
- WorkBuddy 办公 profile 未做  
- Seed「OpenCode」营销节点 ≠ 本工厂 profile  

---

## 进度

| 项 | 状态 |
|----|------|
| 文档对齐毕业线 | ✅ |
| P0 地基 | ✅ |
| A：bundle chat + --workspace | ✅ |
| B：真 Key 三用例 live 脚本 | ✅ |
| C：验收（自动 + 人手） | ✅ 自动项；☐ C4 待 Key |

*版本：2026-07-18*
