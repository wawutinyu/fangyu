# 方隅（fangyu）使用手册

> 面向：**会开浏览器、但不想读代码** 的使用者。  
> 产品是什么 → [产品说明书](PRODUCT_MANUAL.md)。

*版本：2026-07-19 · 以 macOS 为主，Windows 命令对称写出。*

---

## 0. 五分钟先跑通（必做）

目标：看到画布上的流程被真正跑一遍。

### 0.1 启动

在项目根目录 `/Users/mac/Projects/fangyu`（或你的克隆路径）：

```bash
# macOS / Linux
chmod +x dev.sh
./dev.sh
```

```powershell
# Windows
.\dev.bat
```

等终端不再狂刷后，浏览器打开：

**http://127.0.0.1:5173**

| 地址 | 是什么 |
|------|--------|
| http://127.0.0.1:5173 | 方隅·序（你主要用这个） |
| http://127.0.0.1:8000/docs | API 文档（可暂时不理） |

打不开 → 先 `./dev-clean.sh`（Win：`dev-clean.bat`）再重新 `./dev.sh`。

### 0.2 填一把钥匙（预览才有脑）

1. 顶栏点 **设置**  
2. 填入你的大模型 API Key（如 DeepSeek）并保存  
3. 关掉设置  

没 Key 时，部分流程能加载，但「大模型 / 工具轮」会失败或空转。

### 0.3 第一次预览

1. 确认顶栏是 **序**，模式是 **Flow（流程）** ——不是 Agent 画布  
2. 点 **创建 → 体验全部**（推荐新手）  
3. 点蓝色按钮 **预览**  
4. 看底部面板是否出现运行结果  

**到这里，你已经会用方隅最核心的循环：加载 → 预览。**

---

## 1. 界面认识（只记这些）

```
┌──────────────────────────────────────────────────────────┐
│  序 | 律 | 观     创建 ▾   更多 ▾   [预览]   设置          │  ← 顶栏
├────────┬─────────────────────────────────────────────────┤
│ 组件   │              画布（拖节点、连线）                 │
│ 节点库 │                                                 │
└────────┴─────────────────────────────────────────────────┘
│ 底部：预览日志 / 运维 / 监控 …                            │
└──────────────────────────────────────────────────────────┘
```

| 区域 | 干什么 |
|------|--------|
| **序** | 设计台（Flow / Agent） |
| **律** | 宪法与约束 |
| **观** | 现场与告警（先可少碰） |
| **创建** | 意图生成、场景、**示例用例**、资产库 |
| **预览** | 让当前 Flow 在本机 API 上真跑 |
| **组件** | 从左边拖节点到画布 |
| **底部运维** | 托管、工厂通讯录、飞书向导、人审等 |

**Flow vs Agent：**

- **Flow**：流程图，定义「怎么一步步干活」——**日常请先用这个**  
- **Agent**：多 Agent 谁协作谁——等 Flow 熟了再玩  

---

## 2. 安装与启动

### 2.1 环境

| 软件 | 版本 |
|------|------|
| Python | 3.10+（推荐 3.12） |
| Node.js | 18+ |
| 浏览器 | Chrome / Edge / Safari |

```bash
python3 --version
node --version
```

建议使用仓库自带虚拟环境：

```bash
cd ~/Projects/fangyu   # 改成你的路径
source .venv/bin/activate   # 若已创建过
# 没有则：
# python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
npm install
```

### 2.2 日常启动 / 停止

| 动作 | macOS / Linux | Windows |
|------|---------------|---------|
| 启动 | `./dev.sh` | `dev.bat` |
| 清端口再启 | `./dev-clean.sh` 再 `./dev.sh` | `dev-clean.bat` 再 `dev.bat` |
| 可选 Worker | 另开终端 `./dev-worker.sh` | `dev-worker.bat` / 托盘 |

### 2.3 桌面原生（可选）

与网页 **同一套界面**，多了托盘和自动起 API/Worker：

- macOS：`./install-native.sh` 一次，之后可用 `./dev-native.sh`  
- Windows：`install-native.bat` / `dev-native.bat`  

详见 `fangyu-worker-tauri/README.md`。

---

## 3. 每天最常用的操作

### 3.1 加载现成例子

**创建 → 示例用例**，或快捷：

| 菜单项 | 适合 |
|--------|------|
| **体验全部** | 第一次，啥都看看 |
| **拼装验收 · Harness 级** | 看「循环 + 工具轮」怎么拼 |
| 其它用例 | 分支、记忆、MCP 等单项 |

加载后画布会出现节点，点 **预览**。

### 3.2 改任务文案再跑

1. 点画布上的 **任务 / 输入** 节点  
2. 右侧或属性里改「默认值」  
3. 再点 **预览**  

### 3.3 自己拖一条最小流程

1. 从左侧 **组件** 拖：**输入 → 大模型调用 → 输出**  
2. 从输入的点拖线到大模型，再到输出  
3. 给大模型写一句系统提示或用户提示  
4. **预览**  

连线规则：输出不能再接下一个业务节点；输入一般作为起点。细节见 [连线规则](FLOW_CONNECTION_RULES.md)。

### 3.4 意图生成（懒人建流程）

1. **创建 → 意图生成**  
2. 写一句话，例如：「总结这段说明并输出」  
3. 可选模板，点生成 → 应用到画布  
4. **预览**  

### 3.5 导出 Bundle（带走）

1. 画布满意后：**更多 → 导出 Bundle**（或导出相关入口）  
2. 得到可独立运行的包  
3. 进阶：`python -m fangyu --run-bundle <目录>`  

命令行工厂出包示例：

```bash
python -m fangyu bundle create --profile opencode --dest ~/tmp/my-agent
python -m fangyu --run-bundle ~/tmp/my-agent
```

（需 Key；profile 还有 `workbuddy` / `multi` / `action`。）

---

## 4. 按场景使用（建议照抄）

### 场景 A：办公周报协作（多 Agent）

1. **创建 → 意图生成**，切到 **Agent** 模式（若有）  
2. 意图写：「协作写本周产品周报并落盘」  
3. 模板可选办公相关 → 应用到 **Agent 画布**  
4. 或命令行竖切（不依赖你点 UI）：

```bash
python scripts/demo_vertical_slice.py
```

说明：[办公×编排](OFFICE_ORCHESTRATE.md)、[竖切](DEMO_VERTICAL_SLICE.md)。

### 场景 B：在工作区里改文件（拼装能力）

1. **创建 → 拼装验收 · Harness 级**  
2. 确认图上是 **循环(until_done)** + **工具轮**（不是只有一个整环也行）  
3. **设置** 里 Key 已填  
4. **预览** —— 应在临时/绑定工作区产生文件  

平台口径：[拼装验收说明](PLATFORM_COMPOSE_HARNESS.md)。

### 场景 C：看跨厂 / 值班（观 + 运维）

1. 顶栏 **观**  
2. 底部 **运维 → 工厂**：通讯录、探测  
3. 进阶脚本：`python scripts/dual_factory_duty_acceptance.py`  

见 [双厂值班](DUAL_FACTORY_DUTY.md)。

### 场景 D：飞书（先配凭证，真机暂缓）

1. 底部 **运维 → 飞书**  
2. 填 Bundle 路径与 App 凭证，写入  
3. **真机事件订阅暂缓** —— 配好也不等于已接真聊天  

见 [飞书说明](IM_FEISHU.md)。

---

## 5. 律与观（知道即可）

### 律

- 打开顶栏 **律**  
- 可查看/调整宪法模板（禁止 shell、禁止某类节点等）  
- 意图生成时会做扫描；被拦会提示  

### 观

- 打开顶栏 **观**  
- 看协作现场、告警铃铛  
- 没有跨厂实例时，画面可能较空 —— 正常  

---

## 6. 常见问题

| 现象 | 处理 |
|------|------|
| 5173 打不开 | `dev-clean` 后重开 `dev`；确认没有别的程序占端口 |
| 预览灰掉 / API 离线 | 看终端里 `python -m fangyu --server` 是否还在；浏览器硬刷新 |
| 预览失败、模型报错 | **设置** 里检查 API Key / 供应商 |
| 找不到「Harness」 | **创建 → 拼装验收 · Harness 级**；须在 **Flow** 模式 |
| 画布很空 / 只有一个黑盒 | 用「拼装验收」或自己拖 **循环 + 工具轮**；整环是可选捷径 |
| 改了代码界面没变 | Cmd+Shift+R 硬刷新；确认连的是 5173 开发服不是旧 dist |
| 想停干净 | 关终端进程，或 `dev-clean` |

---

## 7. 建议你「先会」的清单

- [ ] 能 `./dev.sh` 打开 Studio  
- [ ] 能填 Key  
- [ ] 能 **创建 → 体验全部 → 预览**  
- [ ] 能改输入节点文案再预览  
- [ ] 知道 Flow 和 Agent 的区别  
- [ ] （可选）导出过一次 Bundle  
- [ ] （可选）跑通 `python scripts/demo_vertical_slice.py`  

会这些，就算**会用方隅入门**。其余是场景加深。

---

## 8. 进阶文档（用到再看）

| 需求 | 文档 |
|------|------|
| 产品定位 | [产品说明书](PRODUCT_MANUAL.md) |
| 连线为什么连不上 | [FLOW_CONNECTION_RULES](FLOW_CONNECTION_RULES.md) |
| 一键体验包了什么 | [FULL_EXPERIENCE](FULL_EXPERIENCE.md) |
| 毕业与进度 | [GRADUATION_EXPORTABLE_AGENT](GRADUATION_EXPORTABLE_AGENT.md) |
| 接入外部 Agent | [INTEGRATION_COOKBOOK](INTEGRATION_COOKBOOK.md) |
| 安全模型 | [SECURITY_MODEL](SECURITY_MODEL.md) |

---

## 9. 求助时请带上

1. 操作系统 + 是否 `./dev.sh` 启动  
2. 浏览器地址栏是否为 `127.0.0.1:5173`  
3. 卡在：启动 / 设置 Key / 创建 / 预览 / 导出  
4. 底部或终端里的报错原文（可打码 Key）  

---

*手册会随产品改版更新。若与界面不一致，以当前 Studio 菜单文案为准，并请提 issue 或让助手改文档。*
