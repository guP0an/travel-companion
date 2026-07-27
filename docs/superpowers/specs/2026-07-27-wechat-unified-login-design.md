# 丸丸微信三端统一登录设计

状态：已批准，待实现  
日期：2026-07-27

## 1. 目标

丸丸提供三种微信登录入口，并让它们归属于同一套 Supabase 用户和业务数据：

1. 微信小程序内使用 `wx.login` 一键登录。
2. 微信内打开 `wanwantrip.online` 时使用公众号网页授权。
3. PC 浏览器打开 `wanwantrip.online` 时使用微信开放平台扫码登录。

用户登录后继续使用现有行程、账本、票据和打卡功能，不新增第二套账号系统。

## 2. 方案选择

采用“微信 OAuth 身份映射 + Supabase Magic Link 会话交接”：

- 三端微信身份都进入现有 `wechat_identities`。
- 优先使用 `unionid` 识别同一微信用户，`openid` 作为应用内身份。
- 小程序继续使用现有短期 ES256 JWT。
- 网页 OAuth 回调完成后，由服务端为对应 Supabase 用户生成一次性 Magic Link，再交给 Supabase 建立标准网页会话。

不采用自建网页会话，因为那会要求重写 `useSession`、数据库请求、Storage 上传和刷新令牌逻辑。不采用三套独立用户，因为会造成行程与账本分裂。

## 3. 用户体验

### 3.1 小程序

登录页保留“微信一键登录”。登录成功后保存短期令牌，过期时重新调用 `wx.login`。

### 3.2 微信内网页

登录面板显示“微信登录”。点击后跳转公众号 OAuth；授权完成后返回原页面并显示已登录。

### 3.3 PC 网页

登录面板显示“微信扫码登录”。点击后跳转微信开放平台二维码页；扫码确认后返回原页面并显示已登录。

移动浏览器但不在微信内时，仍可打开扫码页，不额外开发短信兜底。

若对应微信环境变量未配置，前端不显示不可用的微信入口，邮箱和手机号登录保持原样。

## 4. 架构与数据流

### 4.1 小程序

```text
wx.login
  -> POST /api/wechat-auth
  -> 微信 code2Session
  -> resolveWechatUser
  -> ES256 Supabase JWT
```

### 4.2 微信内网页与 PC 扫码

```text
GET /api/wechat-oauth?mode=h5|web&returnTo=/
  -> 设置 HttpOnly OAuth state cookie
  -> 跳转微信授权页
  -> 微信回调 /api/wechat-oauth?mode=...&code=...&state=...
  -> 校验 state 和 cookie
  -> 微信 access_token 接口换取 openid / unionid
  -> resolveWechatUser
  -> 为该 Supabase 用户确保服务端占位邮箱
  -> Supabase Admin generateLink(type=magiclink)
  -> 跳转 Supabase verify
  -> 返回 wanwantrip.online
```

OAuth 回调不把微信 `access_token`、`openid`、`unionid` 或 Supabase 管理密钥暴露给浏览器。

## 5. 代码边界

- `api/wechat-auth.ts`：保留小程序入口，抽出可复用的微信用户解析与 Supabase 管理逻辑。
- `api/wechat-oauth.ts`：新增网页 OAuth 发起、回调、Magic Link 会话交接。
- `src/components/AuthBar.tsx`：新增一个环境感知的微信登录按钮。
- `shared/auth.ts`：只放前后端都需要的纯函数，例如微信浏览器识别和安全返回路径。
- `.env.example`、`DEPLOY.md`、`docs/12-wechat-mini-program.md`：补充三端配置。

不增加新依赖，继续使用已有 `node:crypto`、`jose` 和 `@supabase/supabase-js`。

## 6. 配置

小程序：

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`

公众号网页授权：

- `WECHAT_H5_APP_ID`
- `WECHAT_H5_APP_SECRET`

开放平台网站应用：

- `WECHAT_WEB_APP_ID`
- `WECHAT_WEB_APP_SECRET`

公共服务端配置：

- `WECHAT_OAUTH_STATE_SECRET`
- `WECHAT_IDENTITY_PEPPER`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_JWT_PRIVATE_JWK`
