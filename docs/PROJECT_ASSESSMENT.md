# fangyu 项目评估（2026-07，产线地基重审）

> 按「批量产出可导出的 OpenCode / WorkBuddy 级 Agent」重审。  
> 关联：[本机毕业](GRADUATION_EXPORTABLE_AGENT.md) · [L1 路线图](L1_ROADMAP.md) · [愿景](VISION_AND_PRODUCT.md)

---

## 一句话

**方向对：方隅是 Agent 产线（接生院），不是又一个聊天 Bot。**  
**地基未过关：目前能量产的是带身份的 Flow 运行器 + 玩具 action loop，还不能量产 OpenCode harness 级导出物。**

---

## 最值钱的地方

### 1. 北极星清晰且可验收

成功标准已收束为：**搭 → 导出 → 离 Studio → 多轮真干活 → 包内受约束 → 可批量**。  
四门（序/律/行/观）与 Bundle / A2A / 宪法在代码里都有对应物，不是空口号。

### 2. Bundle + A2A RPC 演示级扎实

`core/agent_bundle.py` · `engine/bundle_runtime.py` · `--run-bundle`  
身份、信封、跨包 RPC、固定 action loop 写 workspace — 集成测可锁。

### 3. 宪法 + 违宪可解释是差异化

相对纯 coding agent：governance 不是装饰。前提是 **宪法必须随包执行**（P0-1），不能只快照在 zip 里。

### 4. 测试文化在线

单测 / export parity / Bundle RPC — 在守「说出去的话要能跑」。

---

## 诚实短板（相对毕业线）

| 缺口 | 说明 |
|------|------|
| 真 agentic loop | action loop 是单次 DAG，不是 LLM↔工具多轮 |
| 导出闭包 | tools / skills / MCP 默认不进包 |
| 包内运行时 | 曾用宿主 `DATA_DIR` 执法（P0-1 修复中） |
| Coding 手脚 | Worker 绑平台；Bundle 缺 repo 级读搜改 |
| 工厂 | 场景实例化 ≠ `profile → N bundles` |
| Seed 营销 | 「OpenCode」等未验证 export→真行为 |

**上层建筑（观 polish、空画布 CTA、文案统一）不增加导出物硬度，P0 完成前降优先级。**

---

## 与 OpenCode / WorkBuddy 的关系

| | 方隅 | OpenCode / WorkBuddy |
|--|------|----------------------|
| 角色 | **产线 / 平台** | **产线上造出的成品 Agent** |
| 目标 | 批量导出那一档 harness | 终端用户直接用 |

本机毕业 = 能用方隅造出（并导出）那一档成品，不是 Studio 自己变成那一档。

---

## 阶段评分（2026-07-18 重审）

| 维度 | 分数 | 说明 |
|------|------|------|
| 愿景清晰度 | 9/10 | 产线北极星已钉死 |
| 工程完成度（平台） | 7/10 | 编排与预览可用 |
| **导出物硬度（毕业线）** | **4/10** | 演示有，harness 级未达 |
| 产品可用性 | 5.5/10 | 开发者能用 |
| 测试/可维护 | 8/10 | 健康 |
| 差异化潜力 | 8/10 | Bundle+宪法+联邦，待闭环兑现 |

**整体：~6/10「产线雏形」** — 方向对，成品未过关。旧稿 ~7.5 偏乐观于「导出后能干活」。

---

## 杠杆最大的优先级（地基）

1. **P0-1** Bundle `DATA_DIR` / 宪法随包执行  
2. **P0-3** 真 Agentic Loop  
3. **P0-4** Coding 手脚进包  
4. **P0-2** 导出闭包  
5. **P0-5** 工厂 + OpenCode profile 集成测  

详见 [GRADUATION_EXPORTABLE_AGENT.md](GRADUATION_EXPORTABLE_AGENT.md)。

---

## 总结

胜负手不是再加 Studio 皮肤，而是 **让导出物在包内自洽地多轮干活**。  
愿景有用的前提：这条产线地基夯实。

*版本 v2.0 · 2026-07-18（产线地基重审）*
