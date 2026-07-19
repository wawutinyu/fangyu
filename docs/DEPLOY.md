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

## 现网（已上线）：systemd + nginx

生产机当前形态（非 Docker）：

- 代码目录：`/opt/fangyu`
- API：`fangyu.service` → `127.0.0.1:8000`
- 对外：HTTPS nginx  
  - Studio：`/fangyu/`  
  - API：`/api/`

手工 / 本机一键（与线上一致）：

```bash
chmod +x scripts/deploy-systemd-remote.sh
./scripts/deploy-systemd-remote.sh root@你的IP /path/to/私钥
# 构建时使用 BASE_PATH=/fangyu/
```

---

## GitHub 自动部署（CD）

工作流：[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

**效果**：`main` 上 **CI 全部通过** 后，自动把该 commit 同步到服务器、重启 `fangyu`、检查健康。也可在 Actions 里手动点 **Deploy → Run workflow**。

### 一次性配置（仓库 Secrets）

GitHub → 仓库 → **Settings → Secrets and variables → Actions** → New repository secret：

| Secret | 例 |
|--------|-----|
| `DEPLOY_HOST` | `117.72.174.168` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | 部署专用私钥全文（含 `BEGIN` / `END` 行） |

可选 Variables：`DEPLOY_HEALTH_URL`、`DEPLOY_UI_URL`（默认 `https://主机/api/health` 与 `https://主机/fangyu/`）。

服务器 `authorized_keys` 里需有对应**公钥**（本机若已生成过 `.fangyu/github-deploy`，公钥已可写到服务器）。

### 本机 Docker 方案（可选）

若目标机走 Compose 而不是 systemd：

```bash
./scripts/deploy-remote.sh root@你的IP ~/.ssh/你的私钥
```

防火墙放行 **443/80**（现网）或 **8000**（直连 Compose）。

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

- [ ] `GET https://主机/api/health` 返回 `ok`  
- [ ] 浏览器打开 `https://主机/fangyu/` 能进 Studio  
- [ ] 设置里 Key 可用，**创建 → 体验全部 → 预览** 能跑  
- [ ] `systemctl restart fangyu` 后 API 仍健康；`/opt/fangyu/data` 还在  

---

## 故障

| 现象 | 处理 |
|------|------|
| Deploy 失败 SSH | 检查 Secrets 与服务器 `authorized_keys`；私钥须完整 |
| 构建失败 npm | 本机/CI 构建；线上 systemd 路径不在服务器上跑 vite |
| 页面空白 / 资源 404 | 确认构建带 `BASE_PATH=/fangyu/`，nginx `alias` 指向 `fangyu-studio/dist` |
| 外网打不开 | 走 HTTPS；`:8000` 仅本机监听属正常 |
| SSH Permission denied | 配密钥或核对 `DEPLOY_SSH_KEY` |
