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

1. 把 IdP 的 `issuer` / `audience` 写入 `sso.json`（须与 token 声明一致）。
2. 配置 `oidc.jwks_uri`（公开 JWKS 端点）。
3. 可选：`authorization_endpoint` / `token_endpoint` / `client_id` 给前端登录页用。

校验规则：

| `alg` | 路径 |
|-------|------|
| `HS256` | 本地 `shared_secret`（开发签发） |
| `RS256` | 拉取并缓存 `oidc.jwks_uri`，按 `kid` 验签 |

JWKS 默认缓存约 1 小时；改配置会清缓存。当前仅支持 **RS256**（常见企业 IdP）。
