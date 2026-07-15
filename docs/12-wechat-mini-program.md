# 12 · 微信小程序与微信登录

> 状态：代码地基已完成，待微信平台参数与生产密钥配置
> 最近更新：2026-07-15
> 用途：说明丸丸小程序的登录架构、部署步骤、安全边界和验收标准。

## 1. 为什么不能直接复用网页登录

网页端继续使用 Supabase 邮箱/手机号会话。微信小程序登录使用微信自己的临时凭证：

```text
小程序 wx.login()
  → 临时 code
  → POST /api/wechat-auth
  → 服务端调用微信 code2Session
  → 得到 openid / unionid
  → 哈希后映射到 Supabase auth.users
  → 服务端签发短时 ES256 JWT
  → 小程序携带 JWT 访问 Supabase / 丸丸 API
```

微信 `AppSecret`、Supabase 管理密钥、身份哈希 pepper 和 JWT 私钥只存在于 Vercel。小程序包里只保存短时访问令牌。

## 2. 当前代码

| 路径 | 责任 |
|---|---|
| `api/wechat-auth.ts` | 校验 code、调用微信、映射用户、签发短时 JWT、基础限流 |
| `supabase/schema.sql` | `wechat_identities` 身份映射表；RLS 开启且不向客户端授权 |
| `miniprogram/services/auth.js` | `wx.login`、换取会话、本地短时缓存和自动续登 |
| `miniprogram/pages/login/*` | 小程序微信登录首屏 |
| `tests/wechat-auth.test.mjs` | code 交换、错误处理、身份哈希、账号复用和 JWT 权限测试 |
| `project.config.json` | 微信开发者工具项目入口；当前使用游客 AppID |

## 3. 生产启用步骤

1. 在微信公众平台注册小程序并完成主体认证，取得小程序 `AppID` 和 `AppSecret`。
2. 在 Supabase 执行最新 `supabase/schema.sql`，创建 `wechat_identities`。
3. 使用 Supabase CLI 生成 ES256 JWK：`supabase gen signing-key --algorithm ES256`。
4. 在 Supabase Authentication → JWT Signing Keys 导入该私钥并按官方轮换流程启用；旧 key 在确认网页会话正常前不要撤销。
5. 把同一份私有 JWK 作为 `SUPABASE_JWT_PRIVATE_JWK` 存进 Vercel Sensitive Environment Variable。
6. 在 Vercel 配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_IDENTITY_PEPPER`、`SUPABASE_SECRET_KEY` 和可选 `WECHAT_TOKEN_TTL_SECONDS`。
7. 在微信公众平台把丸丸正式 HTTPS API 域名加入“request 合法域名”，并同步修改 `miniprogram/config.js`。
8. 在微信开发者工具中把 `project.config.json` 的游客 AppID 替换为真实 AppID，完成真机登录测试。

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

## 6. 当前未完成

- 尚未取得并配置真实微信 `AppID/AppSecret`。
- 尚未在 Supabase 导入并启用 ES256 signing key。
- 尚未把 `wechat_identities` 迁移到生产库。
- 尚未配置微信 request 合法域名；正式提交前应先绑定丸丸自有域名。
- 当前只有登录骨架，规划、行程、账本和打卡页面还需逐步迁移为小程序页面。
