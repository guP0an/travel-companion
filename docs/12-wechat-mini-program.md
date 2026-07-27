# 12 · 微信三端登录

> 状态：小程序、微信内网页和 PC 扫码代码已完成，待微信平台参数与生产验收
> 最近更新：2026-07-27
> 用途：说明丸丸微信三端登录架构、部署步骤、安全边界和验收标准。

## 1. 三端为什么需要不同入口

三端使用不同微信资质和授权协议，但最终都映射到同一套 Supabase 用户和业务数据。

```text
小程序：wx.login → /api/wechat-auth → code2Session → ES256 JWT
微信内网页：公众号 OAuth → /api/wechat-oauth → Supabase Magic Link 会话
PC 网页：开放平台扫码 → /api/wechat-oauth → Supabase Magic Link 会话
```

微信 `AppSecret`、Supabase 管理密钥、身份哈希 pepper 和 JWT 私钥只存在于 Vercel。小程序包里只保存短时访问令牌。

## 2. 当前代码

| 路径 | 责任 |
|---|---|
| `api/wechat-auth.ts` | 校验 code、调用微信、映射用户、签发短时 JWT、基础限流 |
| `api/wechat-oauth.ts` | 网页 OAuth state、微信授权回调、身份映射和 Supabase 会话交接 |
| `supabase/schema.sql` | `wechat_identities` 身份映射表；RLS 开启且不向客户端授权 |
| `src/components/AuthBar.tsx` | 按浏览器环境显示“微信登录”或“微信扫码登录” |
| `miniprogram/services/auth.js` | `wx.login`、换取会话、过期清理、本地短时缓存、自动续登和 Bearer 请求头 |
| `miniprogram/pages/login/*` | 小程序微信登录首屏 |
| `tests/wechat-auth.test.mjs` | code 交换、错误处理、身份哈希、账号复用和 JWT 权限测试 |
| `tests/wechat-client-auth.test.mjs` | 小程序缓存过期、登录交换、令牌复用、Bearer 请求头和失败提示测试 |
| `tests/wechat-oauth.test.mjs` | state、回跳路径、OAuth 交换、Magic Link 和错误边界测试 |
| `tests/wechat-web-ui.test.mjs` | 网页环境识别、入口文案和未配置时隐藏测试 |
| `project.config.json` | 微信开发者工具项目入口；当前使用游客 AppID |

## 3. 生产启用步骤

### 3.1 小程序

1. 在微信公众平台注册小程序并完成主体认证，取得小程序 `AppID` 和 `AppSecret`。
2. 在 Supabase 执行最新 `supabase/schema.sql`，创建 `wechat_identities`。
3. 使用 Supabase CLI 生成 ES256 JWK：`supabase gen signing-key --algorithm ES256`。
4. 在 Supabase Authentication → JWT Signing Keys 导入该私钥并按官方轮换流程启用；旧 key 在确认网页会话正常前不要撤销。
5. 把同一份私有 JWK 作为 `SUPABASE_JWT_PRIVATE_JWK` 存进 Vercel Sensitive Environment Variable。
6. 在 Vercel 配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_IDENTITY_PEPPER`、`SUPABASE_SECRET_KEY` 和可选 `WECHAT_TOKEN_TTL_SECONDS`。
7. 在微信公众平台把丸丸正式 HTTPS API 域名加入“request 合法域名”，并同步修改 `miniprogram/config.js`。
8. 在微信开发者工具中把 `project.config.json` 的游客 AppID 替换为真实 AppID，完成真机登录测试。

### 3.2 微信内网页

1. 准备已认证公众号，在公众号后台把 `wanwantrip.online` 配为网页授权域名。
2. 在 Vercel 配置 `WECHAT_H5_APP_ID`、`WECHAT_H5_APP_SECRET`。
3. 微信内打开正式站点，确认按钮文案为“微信登录”，授权后返回原页面并建立 Supabase 会话。

### 3.3 PC 扫码

1. 在微信开放平台创建并通过网站应用审核，把 `wanwantrip.online` 配为回调域名。
2. 在 Vercel 配置 `WECHAT_WEB_APP_ID`、`WECHAT_WEB_APP_SECRET`。
3. PC 打开正式站点，确认按钮文案为“微信扫码登录”，扫码确认后返回原页面。

### 3.4 网页公共配置

- 配置至少 32 字节随机值 `WECHAT_OAUTH_STATE_SECRET`。
- 配置 `WECHAT_OAUTH_ORIGIN=https://wanwantrip.online`。
- 网页入口为 `GET /api/wechat-oauth`；未配置对应资质时前端自动隐藏该入口。

## 4. 安全约束

- 不把 `session_key`、`openid` 或 `unionid` 返回给小程序；服务端只保存带 pepper 的 HMAC 哈希。
- 不在日志中输出 code、AppSecret、openid、unionid、管理密钥或 JWT 私钥。
- 访问令牌默认 1 小时，过期后重新执行 `wx.login`，不在第一版引入长期 refresh token。
- `wechat_identities` 没有客户端 RLS policy，只有服务端管理密钥可以读取和修改。
- 微信账号与既有邮箱账号默认是两个账号；账号合并必须由用户同时证明两边身份后再实现，不能按昵称或手机号猜测合并。
- 提审前补充隐私政策、账号注销、数据删除和未成年人相关说明。

## 5. 验收用例

1. 新微信用户首次登录只创建一个 Supabase 用户和一条身份映射。
2. 同一微信用户重复登录始终得到同一个 `user_id`。
3. 无效、过期或重复使用的 code 返回友好错误，不创建用户。
4. 小程序 JWT 只能访问自己的行程、账本、打卡和凭证。
5. JWT 过期后小程序自动重新登录，旧 token 不再被接受。
6. AppSecret、管理密钥和私钥不出现在小程序包、Git、接口响应与日志中。
7. OAuth state 不能伪造、过期或跨模式复用，回跳地址不能离开 `wanwantrip.online`。
8. 微信内网页和 PC 扫码都能建立标准 Supabase 会话并访问自己的数据。

## 6. 与网页微信登录的边界

- 小程序使用 `wx.login`，微信内网页使用公众号 OAuth，PC 使用开放平台网站应用扫码。
- 三端不能共用 AppID/AppSecret，但会优先用 `unionid` 归并同一微信用户，`openid` 作为应用内身份。
- 邮箱和手机号账号不会凭昵称或手机号自动与微信账号合并，避免错误合并造成数据泄露。

## 7. 当前未完成

- 尚未取得并配置真实小程序、认证公众号和开放平台网站应用的 AppID/AppSecret。
- 尚未在 Supabase 导入并启用 ES256 signing key。
- 生产库已创建 `wechat_identities`；仍需用真实微信用户完成同账号重复登录验证。
- 尚未配置 `wanwantrip.online` 的小程序 request 合法域名、公众号网页授权域名和开放平台回调域名。
- 当前只有登录骨架，规划、行程、账本和打卡页面还需逐步迁移为小程序页面。
