#!/usr/bin/env bash
# 把方隅部署到远程 Linux（需本机已能 ssh 免密或带密钥）
# 用法：
#   ./scripts/deploy-remote.sh user@host
#   ./scripts/deploy-remote.sh user@host ~/.ssh/id_ed25519
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
KEY="${2:-}"

if [[ -z "$TARGET" ]]; then
  echo "用法: $0 user@host [ssh_private_key]"
  echo "例:   $0 root@117.72.174.168 ~/.ssh/id_ed25519"
  exit 1
fi

SSH=(ssh -o StrictHostKeyChecking=accept-new)
RSYNC=(rsync -az --delete)
if [[ -n "$KEY" ]]; then
  SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new)
  RSYNC=(rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new")
fi

REMOTE_DIR="${REMOTE_DIR:-/opt/fangyu}"

echo "==> 检查远程 Docker…"
"${SSH[@]}" "$TARGET" 'command -v docker >/dev/null || { echo "请先安装 Docker"; exit 1; }; docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null'

echo "==> 同步代码到 $TARGET:$REMOTE_DIR …"
"${SSH[@]}" "$TARGET" "sudo mkdir -p '$REMOTE_DIR' && sudo chown -R \$(whoami) '$REMOTE_DIR'"
"${RSYNC[@]}" \
  --exclude .git \
  --exclude .venv \
  --exclude node_modules \
  --exclude '**/node_modules' \
  --exclude '**/dist' \
  --exclude data \
  --exclude .env \
  --exclude .env.deploy \
  "$ROOT/" "$TARGET:$REMOTE_DIR/"

if [[ -f "$ROOT/.env.deploy" ]]; then
  scp ${KEY:+-i "$KEY"} "$ROOT/.env.deploy" "$TARGET:$REMOTE_DIR/.env.deploy"
else
  "${SSH[@]}" "$TARGET" "cd '$REMOTE_DIR' && cp -n .env.deploy.example .env.deploy || true"
fi

echo "==> 远程构建并启动…"
"${SSH[@]}" "$TARGET" "cd '$REMOTE_DIR' && docker compose --env-file .env.deploy up -d --build"

echo "==> 健康检查…"
"${SSH[@]}" "$TARGET" "sleep 3; curl -fsS http://127.0.0.1:\${FANGYU_HTTP_PORT:-8000}/api/health || curl -fsS http://127.0.0.1:8000/api/health"

echo "[OK] 部署完成。浏览器访问 http://<服务器IP>:8000  （UI+API 同端口）"
echo "     改 Key：SSH 进机器编辑 $REMOTE_DIR/.env.deploy 后 docker compose up -d"
