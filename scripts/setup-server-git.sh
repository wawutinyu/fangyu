#!/usr/bin/env bash
# 在服务器初始化 bare 仓库 + 部署 hook（GitHub 不稳时可直推）
# 用法：
#   ./scripts/setup-server-git.sh root@117.72.174.168 [ssh_private_key]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
KEY="${2:-$ROOT/.fangyu/github-deploy}"

if [[ -z "$TARGET" ]]; then
  echo "用法: $0 user@host [ssh_key]"
  exit 1
fi

SSH=(ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
SCP=(scp -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
if [[ -n "$KEY" && -f "$KEY" ]]; then
  SSH=(ssh -i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
  SCP=(scp -i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
fi

echo "==> 初始化 $TARGET:/opt/fangyu.git …"
"${SSH[@]}" "$TARGET" 'set -e
if [[ ! -d /opt/fangyu.git ]]; then
  git init --bare /opt/fangyu.git
  git --git-dir=/opt/fangyu.git symbolic-ref HEAD refs/heads/main
fi
mkdir -p /opt/fangyu
'

"${SCP[@]}" "$ROOT/scripts/server-post-receive.sh" "$TARGET:/opt/fangyu.git/hooks/post-receive"
"${SSH[@]}" "$TARGET" 'chmod +x /opt/fangyu.git/hooks/post-receive'

HOST_ONLY="${TARGET#*@}"
echo "==> 本机添加 remote production（若已存在则跳过）…"
cd "$ROOT"
if git remote get-url production >/dev/null 2>&1; then
  git remote set-url production "${TARGET}:/opt/fangyu.git"
else
  git remote add production "${TARGET}:/opt/fangyu.git"
fi

export GIT_SSH_COMMAND="ssh -i ${KEY} -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
echo "==> 首次推送 main → production（会触发 hook 构建，可能要几分钟）…"
git push production main

echo "[OK] 以后 GitHub 不稳时："
echo "  GIT_SSH_COMMAND='ssh -i $KEY -o IdentitiesOnly=yes' git push production main"
echo "网络正常时仍可："
echo "  git push origin main   # Actions CD"
echo "服务器仓库: ${TARGET}:/opt/fangyu.git"
echo "健康检查: https://${HOST_ONLY}/api/health"
