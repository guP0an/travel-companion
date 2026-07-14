import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

type Env = Record<string, string | undefined>
type FetchLike = typeof fetch

interface SmsHookPayload {
  user?: { phone?: string }
  sms?: { otp?: string }
}

const SMS_HOST = 'sms.tencentcloudapi.com'
const SMS_SERVICE = 'sms'
const SMS_VERSION = '2021-01-11'
const MAX_BODY_BYTES = 64 * 1024
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest()

const header = (headers: Record<string, string | string[] | undefined>, name: string) => {
  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

const webhookSecretBytes = (secret: string) => {
  const encoded = secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length < 16) throw new Error('invalid webhook secret')
  return bytes
}

export function verifyStandardWebhook(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const id = header(headers, 'webhook-id')
  const timestampText = header(headers, 'webhook-timestamp')
  const signatureText = header(headers, 'webhook-signature')
  const timestamp = Number(timestampText)
  if (!id || !Number.isInteger(timestamp) || !signatureText) throw new Error('missing webhook signature')
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) throw new Error('stale webhook')

  const expected = createHmac('sha256', webhookSecretBytes(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64')
  const candidates = signatureText.split(/\s+/).map((item) => item.replace(/^v1,/, '')).filter(Boolean)
  const valid = candidates.some((candidate) => {
    const actual = Buffer.from(candidate)
    const target = Buffer.from(expected)
    return actual.length === target.length && timingSafeEqual(actual, target)
  })
  if (!valid) throw new Error('invalid webhook signature')
}

export function createTencentSmsRequest(phone: string, otp: string, env: Env, now = new Date()) {
  const secretId = env.TENCENTCLOUD_SECRET_ID
  const secretKey = env.TENCENTCLOUD_SECRET_KEY
  const appId = env.TENCENT_SMS_SDK_APP_ID
  const signName = env.TENCENT_SMS_SIGN_NAME
  const templateId = env.TENCENT_SMS_TEMPLATE_ID
  if (!secretId || !secretKey || !appId || !signName || !templateId) throw new Error('Tencent SMS config missing')
  if (!/^\+861[3-9]\d{9}$/.test(phone)) throw new Error('invalid mainland phone')
  if (!/^\d{6}$/.test(otp)) throw new Error('invalid otp')

  const timestamp = Math.floor(now.getTime() / 1000)
  const date = now.toISOString().slice(0, 10)
  const action = 'SendSms'
  const body = JSON.stringify({
    PhoneNumberSet: [phone],
    SmsSdkAppId: appId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [otp],
  })
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${SMS_HOST}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256(body)}`
  const credentialScope = `${date}/${SMS_SERVICE}/tc3_request`
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256(canonicalRequest)}`
  const secretDate = hmac(`TC3${secretKey}`, date)
  const secretService = hmac(secretDate, SMS_SERVICE)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    url: `https://${SMS_HOST}`,
    init: {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json; charset=utf-8',
        host: SMS_HOST,
        'x-tc-action': action,
        'x-tc-timestamp': String(timestamp),
        'x-tc-version': SMS_VERSION,
      },
      body,
      signal: AbortSignal.timeout(4_000),
    },
  }
}

export async function sendTencentSms(phone: string, otp: string, env: Env, fetcher: FetchLike = fetch) {
  const request = createTencentSmsRequest(phone, otp, env)
  const response = await fetcher(request.url, request.init)
  const data = await response.json() as any
  const providerError = data.Response?.Error
  const status = data.Response?.SendStatusSet?.[0]
  if (!response.ok || providerError || status?.Code !== 'Ok') {
    const code = providerError?.Code || status?.Code || `HTTP_${response.status}`
    throw new Error(`Tencent SMS ${code}`)
  }
  return data.Response?.RequestId as string | undefined
}

const hookResponse = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status })

export async function handleSmsHook(request: Request, env: Env, fetcher: FetchLike = fetch): Promise<Response> {
  if (request.method !== 'POST') return hookResponse(405, { error: { http_code: 405, message: 'Method Not Allowed' } })
  try {
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > MAX_BODY_BYTES) return hookResponse(413, { error: { http_code: 413, message: 'Request too large' } })
    const secret = env.SUPABASE_SMS_HOOK_SECRET
    if (!secret) throw new Error('SMS hook secret missing')
    const rawBody = await request.text()
    if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return hookResponse(413, { error: { http_code: 413, message: 'Request too large' } })
    verifyStandardWebhook(rawBody, Object.fromEntries(request.headers.entries()), secret)
    const payload = JSON.parse(rawBody) as SmsHookPayload
    const phone = payload.user?.phone || ''
    const otp = payload.sms?.otp || ''
    const requestId = await sendTencentSms(phone, otp, env, fetcher)
    console.info('[api/send-sms]', { ok: true, requestId })
    return hookResponse(200, {})
  } catch (error) {
    console.error('[api/send-sms]', { ok: false, error: (error as Error).message })
    return hookResponse(502, { error: { http_code: 502, message: '短信发送失败，请稍后再试' } })
  }
}

const smsHandler: { fetch(request: Request): Promise<Response> } = {
  fetch(request: Request): Promise<Response> {
    return handleSmsHook(request, process.env)
  },
}

export default smsHandler
