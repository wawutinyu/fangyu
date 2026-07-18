# 认证与 SSO

方隅身份落点：**Bearer JWT → ACL `principal_id`**。真企业 IdP 接在配置上，不绑死一家厂商。

## 开发签发

```bash
curl -s http://127.0.0.1:8000/api/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"principal_id":"alice","name":"Alice","roles":["admin"]}'
```

携带：

```http
Authorization: Bearer <access_token>
```

`GET /api/v1/auth/me` 返回主体；组织 ACL 启用后按 principal 鉴权。

## 配置

- `GET/PUT /api/v1/auth/config`
- 落盘：`DATA_DIR/sso.json`（`enabled` / `issuer` / `audience` / `shared_secret` / `oidc.*`）

`enabled=true` 时：非法 Bearer 直接 401。  
`enabled=false` 时：可用 `X-Fangyu-Principal` 旁路注入 ACL 主体（仅开发）。

## OIDC / JWKS（企业）

1. 把 IdP 的 `issuer` / `audience`（本地 JWT 用）写入 `sso.json`。
2. 配置 `oidc.jwks_uri`、`authorization_endpoint`、`token_endpoint`、`client_id`（可选 `client_secret` / `redirect_uri` / `scope`）。
3. Studio「运维 → SSO」或 API：

```bash
# 开始登录
curl -s -X POST http://127.0.0.1:8000/api/v1/auth/oidc/start \
  -H 'Content-Type: application/json' \
  -d '{"redirect_uri":"http://127.0.0.1:5173/"}'

# IdP 回调后换票
curl -s -X POST http://127.0.0.1:8000/api/v1/auth/oidc/callback \
  -H 'Content-Type: application/json' \
  -d '{"code":"...","state":"..."}'
```

流程：授权码 → IdP token → 验 **id_token**（RS256 + JWKS，`aud=client_id`）→ 签发方隅本地 HS256 Bearer。

| `alg` / 场景 | 路径 |
|--------------|------|
| 本地 `HS256` | `shared_secret`（开发签发 / 换票后本地票） |
| IdP `RS256` id_token | `oidc.jwks_uri` |
| API 携带 IdP access_token（若为 RS256 JWT） | 同样走 JWKS，`aud` 须匹配配置 `audience` |

JWKS 默认缓存约 1 小时；改配置会清缓存。Studio 把 Bearer 存 `localStorage.fangyu_access_token`，`apiFetch` 自动带上。

## ACL ↔ SSO 产品路径

1. OIDC / 本地签发拿到 Bearer（运维 → SSO）。
2. `GET /api/v1/auth/me` 返回 `acl.is_member`。
3. `POST /api/v1/acl/sync-sso`（或运维 → 组织 ACL「将当前 SSO 主体加入 ACL」）写入成员，默认角色 `operator`。
4. 启用组织 ACL（`require_principal`）后，中间件注入的 principal 即走成员权限。

`GET /api/v1/acl/me` 可单独查当前主体成员状态。
