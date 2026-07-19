#!/bin/bash
# /opt/fangyu.git/hooks/post-receive
# 本机 git push production 时触发：更新 /opt/fangyu 并重启服务（不依赖 GitHub）
set -euo pipefail

GIT_DIR=/opt/fangyu.git
TARGET=/opt/fangyu
BRANCH=""

while read -r oldrev newrev ref; do
  case "$ref" in
    refs/heads/main) BRANCH=main ;;
    refs/heads/master) BRANCH=master ;;
  esac
done

if [[ -z "$BRANCH" ]]; then
  echo "[fangyu] 忽略非 main/master 推送"
  exit 0
fi

echo "[fangyu] 检出 $BRANCH → $TARGET"
mkdir -p "$TARGET"
git --git-dir="$GIT_DIR" --work-tree="$TARGET" checkout -f "$BRANCH"
# 清掉已删除的跟踪文件残留，但保住运行时数据
git --git-dir="$GIT_DIR" --work-tree="$TARGET" clean -fd \
  -e .venv -e data -e .env -e .env.deploy -e node_modules \
  -e '**/node_modules' -e fangyu-studio/dist -e .fangyu

cd "$TARGET"

echo "[fangyu] Python 依赖…"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q -U pip
.venv/bin/pip install -q -e .

echo "[fangyu] 构建 Studio（BASE_PATH=/fangyu/）…"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
BUILD_OK=0
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund && BASE_PATH=/fangyu/ npm run build -w fangyu-studio && BUILD_OK=1
else
  npm install --no-audit --no-fund && BASE_PATH=/fangyu/ npm run build -w fangyu-studio && BUILD_OK=1
fi
if [[ "$BUILD_OK" != "1" ]]; then
  echo "[fangyu] WARN: Studio 构建失败，保留旧 dist（若有）继续重启 API"
fi

if [[ ! -f fangyu-studio/dist/index.html ]]; then
  echo "[fangyu] ERROR: 无 fangyu-studio/dist/index.html，拒绝重启"
  exit 1
fi
echo "[fangyu] 重启服务…"
systemctl restart fangyu
sleep 2
systemctl is-active fangyu
curl -fsS http://127.0.0.1:8000/api/health
echo
echo "[fangyu] OK — https://$(hostname -I | awk '{print $1}')/fangyu/ 或你的域名/fangyu/"
