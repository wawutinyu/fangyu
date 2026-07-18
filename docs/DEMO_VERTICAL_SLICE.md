# 可演示竖切（5 分钟）

> 目标：用**已有能力**串一条能给人看的闭环，而不是再开新模块。

## 故事

**意图 → multi Bundle → ACL → 编排落盘 → 托管启停**

1. 一句话意图导出多 Agent 拓扑包  
2. 组织 ACL：`operator` 可写 `deliverables/`，禁 `shell`  
3. 多 Agent 编排写出周报纪要  
4. `bundle manage` 后台常驻、健康探测、停止  

## 一键跑

```bash
# 默认 mock（无需 Key，CI/现场稳）
python scripts/demo_vertical_slice.py

# 真模型（读 Studio fangyu.db 或 .env）
python scripts/demo_vertical_slice.py --live

# 保留临时目录便于展示文件
python scripts/demo_vertical_slice.py --keep
```

成功应看到：`[OK] 可演示竖切通过`，并有 `deliverables/weekly.md`。

## Studio 入口

窗口**底部**标签栏（不是顶栏）：

`预览 | 行 | 资产 | 运维 | 更多 ▾`

点 **运维** → 托管启停 / 日志 · 组织 ACL。

若看不到：硬刷新页面（或重启 `./dev.sh`），确认已拉到含运维面板的最新代码。

1. 「不是 Chat 玩具，是**能导出的 Agent 产线**。」  
2. 「意图直接打成 **multi Bundle**，拓扑在包里，脱离 Studio 也能 `orchestrate`。」  
3. 「**律**：同一套组织 ACL，运营能写纪要、不能乱 shell。」  
4. 「**行**：`manage start` 常驻，健康可探、可停。」  
5. 「成品在用户工作区 `deliverables/`，带走即用。」

## 和毕业的关系

这是 **可演示毕业** 的验收脚本，不是可交付毕业（真 IM / Studio 面板 / docx / SSO 仍后置）。

关联：[毕业标准](GRADUATION_EXPORTABLE_AGENT.md)
