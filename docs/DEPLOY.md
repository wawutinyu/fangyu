# 部署到服务器

> 仓库原先没有现成生产部署包；本页是 **2026-07-19** 补上的 Docker 单机方案。  
> **使用 / 产品说明** 见 [使用手册](USER_GUIDE.md)、[产品说明书](PRODUCT_MANUAL.md)。

---

## 架构（推荐）

```text
浏览器 ──► :8000  fangyu 容器
                 ├─ /api/*     FastAPI
                 └─ /*         Studio 静态页（FANGYU_SERVE_UI=1）
数据卷 ──► /data
```

可选前面再挂 nginx（`docker compose --profile gateway`）。

---

## 本机一键（有 Docker 时）

```bash
cd ~/Projects/fangyu
cp .env.deploy.example .env.deploy
# 编辑 .env.deploy：可填 DEEPSEEK_API_KEY 等

docker compose --env-file .env.deploy up -d --build
curl -fsS http://127.0.0.1:8000/api/health
# 浏览器打开 http://127.0.0.1:8000
```

停止：

```bash
docker compose --env-file .env.deploy down
```

---

## 部署到远程 Linux

### 你需要提供

1. **主机**：如 `root@117.72.174.168`（本机 `known_hosts` 里曾出现过此 IP）  
2. **SSH 登录**：私钥文件路径，或配置好 `ssh-agent`  
3. 远程已装 **Docker + Compose 插件**

当前助手环境：**无 SSH 私钥**（`ssh-add -l` 为空），对 `117.72.174.168` 试连为 `Permission denied`，**无法代你完成实际上机**。

### 有密钥后一条命令

```bash
chmod +x scripts/deploy-remote.sh
./scripts/deploy-remote.sh root@你的IP ~/.ssh/你的私钥
```

脚本会：rsync 代码 → 远程 `docker compose up -d --build` → 打健康检查。

### 无脚本、纯手工

```bash
ssh root@你的IP
# 安装 Docker 后：
git clone <你的仓库> /opt/fangyu   # 或 scp/rsync
cd /opt/fangyu
cp .env.deploy.example .env.deploy
nano .env.deploy
docker compose --env-file .env.deploy up -d --build
```

防火墙放行 **8000**（或 gateway 的 80/443）。

---

## 环境变量

见 `.env.deploy.example`。常用：

| 变量 | 含义 |
|------|------|
| `FANGYU_HTTP_PORT` | 宿主机映射端口，默认 8000 |
| `CORS_ORIGINS` | 跨域；同域托管 UI 可用 `*` |
| `DEEPSEEK_API_KEY` 等 | 模型密钥（也可进 Studio 设置再填） |
| `FANGYU_SERVE_UI` | 容器内已默认 `1` |

---

## 安全注意

- **不要**把 `.env.deploy` 提交进 git  
- 公网务必改默认端口 / 上 HTTPS / 配防火墙  
- 生产勿长期 `CORS_ORIGINS=*` 且无鉴权裸奔  
- API Key、飞书密钥只放服务器环境或 Studio 设置  

---

## 验收清单

- [ ] `GET /api/health` 返回 `ok`  
- [ ] 浏览器打开 `http://IP:8000` 能进 Studio  
- [ ] 设置里 Key 可用，**创建 → 体验全部 → 预览** 能跑  
- [ ] 重启容器后 `/data` 数据还在  

---

## 故障

| 现象 | 处理 |
|------|------|
| 构建失败 npm | 机器内存不够；加大 swap 或本机构建后导出镜像 |
| 页面空白 | 看容器日志 `docker compose logs -f fangyu`；确认 `FANGYU_SERVE_UI=1` 且 dist 存在 |
| 外网打不开 | 云安全组 / `ufw allow 8000` |
| SSH Permission denied | 配密钥：`ssh-copy-id` 或把公钥写入服务器 `authorized_keys` |

---

*把「用户@主机」和私钥路径发我之后，可以继续代跑 `deploy-remote.sh`。*
