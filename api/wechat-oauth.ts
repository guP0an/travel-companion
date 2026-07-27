import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type WechatOauthMode = 'h5' | 'web'
export type WechatOauthEnv = Record<string, string | undefined>
type FetchLike = typeof fetch

interface OauthState {
  mode: WechatOauthMode
  returnTo: string
  expiresAt: number
  nonce: string
}

interface WechatOauthTokenResponse {
  openid?: string
  unionid?: string
  errcode?: number
}

const STATE_TTL_MS = 10 * 60 * 1000

export class WechatOauthError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function sanitizeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

function requireStateSecret(secret: string) {
  if (secret.length < 16) throw new WechatOauthError(503, 'wechat OAuth state secret missing')
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function createOauthState(
  mode: WechatOauthMode,
  returnTo: string,
  secret: string,
  now = Date.now(),
): string {
  requireStateSecret(secret)
  const payload: OauthState = {
    mode,
    returnTo: sanitizeReturnTo(returnTo),
    expiresAt: now + STATE_TTL_MS,
    nonce: randomBytes(16).toString('base64url'),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${sign(encoded, secret)}`
}

export function verifyOauthState(value: string, secret: string, now = Date.now()) {
  requireStateSecret(secret)
  const [encoded, signature, extra] = value.split('.')
  if (!encoded || !signature || extra) throw new WechatOauthError(401, 'invalid OAuth state')
  const expected = sign(encoded, secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    actualBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new WechatOauthError(401, 'invalid OAuth state')
  }

  let payload: OauthState
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OauthState
  } catch {
    throw new WechatOauthError(401, 'invalid OAuth state')
  }
  if (
    (payload.mode !== 'h5' && payload.mode !== 'web')
    || payload.expiresAt < now
    || payload.expiresAt > now + STATE_TTL_MS
  ) {
    throw new WechatOauthError(401, 'expired OAuth state')
  }
  return { mode: payload.mode, returnTo: sanitizeReturnTo(payload.returnTo) }
}

function providerConfig(mode: WechatOauthMode, env: WechatOauthEnv) {
  const appId = mode === 'h5' ? env.WECHAT_H5_APP_ID : env.WECHAT_WEB_APP_ID
  const appSecret = mode === 'h5' ? env.WECHAT_H5_APP_SECRET : env.WECHAT_WEB_APP_SECRET
  if (!appId || !appSecret) throw new WechatOauthError(503, 'wechat OAuth provider missing')
  return { appId, appSecret }
}

export function buildWechatAuthorizeUrl(
  mode: WechatOauthMode,
  state: string,
  callbackUrl: string,
  env: WechatOauthEnv,
): string {
  const { appId } = providerConfig(mode, env)
  const url = new URL(mode === 'h5'
    ? 'https://open.weixin.qq.com/connect/oauth2/authorize'
    : 'https://open.weixin.qq.com/connect/qrconnect')
  url.search = new URLSearchParams({
    appid: appId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: mode === 'h5' ? 'snsapi_base' : 'snsapi_login',
    state,
  }).toString()
  url.hash = 'wechat_redirect'
  return url.toString()
}

export async function exchangeWechatOauthCode(
  mode: WechatOauthMode,
  code: string,
  env: WechatOauthEnv,
  fetcher: FetchLike = fetch,
) {
  if (!/^[A-Za-z0-9_-]{6,256}$/.test(code)) throw new WechatOauthError(400, 'invalid OAuth code')
  const { appId, appSecret } = providerConfig(mode, env)
  const params = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    code,
    grant_type: 'authorization_code',
  })
  const response = await fetcher(`https://api.weixin.qq.com/sns/oauth2/access_token?${params}`, {
    signal: AbortSignal.timeout(5_000),
  })
  const data = await response.json() as WechatOauthTokenResponse
  if (!response.ok || data.errcode || !data.openid) {
    throw new WechatOauthError(401, 'wechat OAuth code exchange failed')
  }
  return { openid: data.openid, unionid: data.unionid }
}
