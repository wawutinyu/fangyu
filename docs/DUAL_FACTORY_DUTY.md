# 双厂值班验收（P1）

> 把「通讯录 + 心跳 + 告警 + 再探测 + 观」收成可签字清单，而不是再加筛选按钮。

关联：[A2A 发现](A2A_DISCOVERY.md) · [毕业标准](GRADUATION_EXPORTABLE_AGENT.md) · [出厂 Eval](FACTORY_EVAL.md)

## 一句话

**东厂**（平台 API）登记 **西厂**（对端 Bundle）→ 探活 → 人为掐断 → 告警 → 恢复再探 → 观上能回看。过了才算联邦值班可用。

## 怎么跑

```bash
python scripts/dual_factory_duty_acceptance.py
# 或随门禁（无 Key）：
python scripts/factory_gate.py --live-tier smoke
```

退出码：`0` 全绿可签字；`1` 失败；`2` 跳过（Windows / 端口不可绑）。

## 签字清单（脚本自动打勾）

| # | 项 | 含义 |
|---|----|------|
| D1 | 西厂起服 | 对端 Bundle `/health` |
| D2 | 东厂起服 | 平台 `/api/health`（独立 `FANGYU_DATA_DIR`） |
| D3 | 探测入库 | `POST .../factories/probe-save` |
| D4 | 心跳在线 | `POST .../factories/heartbeat` → online≥1 |
| D5 | 观可见 | Presence 主机或 `host.heartbeat` |
| D6 | 人为离线 | 停西厂 → 离线 + `factory.offline` 告警 |
| D7 | 恢复再探 | 西厂重启 → 心跳 online |
| D8 | Presence 对齐 | `POST .../factories/align` |
| D9 | 事件闭环 | 观时间轴含离线与上线/心跳类事件 |

## 产品入口（人手对照）

运维 → **工厂**：探测入库 / 批量心跳 / 对齐 Presence  
观 · 值班墙：主机色、告警铃铛、再探测、时间轴运维筛选

*版本：2026-07-19 · P1*
