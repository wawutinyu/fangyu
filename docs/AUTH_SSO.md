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

## OIDC 预留

`oidc.authorization_endpoint` / `token_endpoint` / `client_id` 写入配置即可对接企业登录页；校验路径当前以本地 HS256 JWT 为主，后续可接 JWKS。
