#!/usr/bin/env bash
# 部署到现网：venv + systemd + nginx（/fangyu/ 静态，/api/ 反代）
# 用法：
#   ./scripts/deploy-systemd-remote.sh user@host [ssh_private_key]
# 环境变量：
#   REMOTE_DIR   默认 /opt/fangyu
#   HEALTH_URL   默认 https://主机/api/health（本机探测可改为 http://127.0.0.1:8000/api/health）
#   UI_URL       默认 https://主机/fangyu/
#   SKIP_BUILD   =1 时跳过本机构建 Studio（假定 dist 已就绪）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
KEY="${2:-}"

if [[ -z "$TARGET" ]]; then
  echo "用法: $0 user@host [ssh_private_key]"
  echo "例:   $0 root@117.72.174.168 ~/.ssh/id_ed25519"
  exit 1
fi

HOST_ONLY="${TARGET#*@}"
REMOTE_DIR="${REMOTE_DIR:-/opt/fangyu}"
HEALTH_URL="${HEALTH_URL:-https://${HOST_ONLY}/api/health}"
UI_URL="${UI_URL:-https://${HOST_ONLY}/fangyu/}"

SSH=(ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes)
RSYNC=(rsync -az --delete)
SCP=(scp -o StrictHostKeyChecking=accept-new -o BatchMode=yes)
if [[ -n "$KEY" ]]; then
  SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o BatchMode=yes)
  RSYNC=(rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new -o BatchMode=yes")
  SCP=(scp -i "$KEY" -o StrictHostKeyChecking=accept-new -o BatchMode=yes)
fi

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> 构建 Studio（BASE_PATH=/fangyu/）…"
  cd "$ROOT"
  if [[ ! -d node_modules ]]; then
    npm ci
  fi
  BASE_PATH=/fangyu/ npm run build -w fangyu-studio
fi

if [[ ! -f "$ROOT/fangyu-studio/dist/index.html" ]]; then
  echo "缺少 fangyu-studio/dist，请先构建或去掉 SKIP_BUILD=1"
  exit 1
fi

echo "==> 同步到 $TARGET:$REMOTE_DIR …"
"${SSH[@]}" "$TARGET" "mkdir -p '$REMOTE_DIR'"
"${RSYNC[@]}" \
  --exclude .git \
  --exclude .venv \
  --exclude node_modules \
  --exclude '**/node_modules' \
  --exclude data \
  --exclude .env \
  --exclude .env.deploy \
  --exclude .fangyu \
  --exclude '**/__pycache__' \
  --exclude .pytest_cache \
  "$ROOT/" "$TARGET:$REMOTE_DIR/"

echo "==> 远程安装依赖并重启 fangyu.service …"
"${SSH[@]}" "$TARGET" bash -s <<EOF
set -euo pipefail
cd '$REMOTE_DIR'
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q -U pip
.venv/bin/pip install -q -e .
systemctl restart fangyu
sleep 2
systemctl is-active fangyu
curl -fsS http://127.0.0.1:8000/api/health
echo
EOF

echo "==> 公网健康检查…"
curl -fsSk "$HEALTH_URL" || curl -fsS "$HEALTH_URL"
echo
curl -fsSk -o /dev/null -w "ui:%{http_code}\n" "$UI_URL" || curl -fsS -o /dev/null -w "ui:%{http_code}\n" "$UI_URL"

echo "[OK] 已部署。打开 $UI_URL"
