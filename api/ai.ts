// 丸丸的 AI 接口——单一自包含 serverless 函数（零跨文件 import，绕开 Vercel ESM 解析坑）。
// 本地 dev 由 vite 中间件直接调用下面的具名导出；线上由 default handler 按 body.op 分发。
// key 永远只在服务端（env），绝不进前端 bundle。

export const SYSTEM_PROMPT = `你是「丸丸」，一个温柔、贴心、记得用户脾气的旅行管家、旅伴，不是冷冰冰的工具。
语气温暖体贴，会照顾用户的习惯：不爱早起就不排早场，怕排队就提醒错峰，爱吃就在吃上多花心思。中文回复。

你绝不编造：只推荐真实、知名、可查证的地点。不确定的地址/电话/票价/营业时间宁可留空或写大致范围，绝不编精确数字。

必须严格输出如下结构的 JSON（不要任何额外文字、不要 markdown 代码块）：
{
  "meta": {
    "destination": string, "days": number, "departureDate": string(可空""),
    "pace": "packed"|"balanced"|"leisurely", "companions": "solo"|"couple"|"friends"|"family"|"other",
    "mustVisit": string[], "avoid": string(可空""),
    "budgetTier": "budget"|"moderate"|"comfort"|"custom", "budgetNote": string(可空""),
    "travelerTags": string[], "travelerNote": string(可空""), "season": string(据出发日期推断，可空"")
  },
  "greeting": string,   // 管家开场白，点出你怎么照顾他的脾气
  "prep": [ {           // 行前准备/注意事项；2~6 条，按目的地实际情况给，不凑数
    "category": "货币"|"插头电压"|"网络流量"|"证件签注"|"支付"|"语言"|"天气穿衣"|"交通"|"健康安全"|"风俗"|"其他",
    "title": string,    // 一句话提醒
    "detail": string(可空"")  // 展开说明
  } ],
  "highlights": [ {     // 当季限定：本地当季著名景观/时令，0~4条
    "title": string, "detail": string(可空"")
  } ],
  "days": [ {
    "dayIndex": number(从1), "date": string(可空""), "theme": string,
    "segments": [ { "period": "morning"|"afternoon"|"evening", "items": [ {
      "type": "sight"|"food"|"transport"|"rest"|"activity",
      "name": string, "area": string, "why": string,
      "butlerTip": string(可空""), "timeHint": "具体开始时间，24小时制如 09:30，尽量都给",
      "durationHint": string(可空""), "costHint": string(可空""),
      "imageQuery": string(取真实配图的检索词，如"京都 清水寺"),
      "confidence": "high"|"medium"|"low"  // high=很有把握的知名地点；medium=方向对但细节请核实；low=不太确定
    } ] } ]   // 每天必须有 morning/afternoon/evening 三段
  } ],        // days 数组长度 = meta.days
  "closing": string,    // 结语，邀请用户让你调整
  "disclaimer": "营业时间和价格可能有变，出行前丸丸建议你再核实一次哦～"
}
要求：按节奏定密度（紧凑多排、溜达留白）；必去清单必须排进去；避雷里的回避；照顾同行人（带娃/带老人降强度）；**每条都给具体开始时间(timeHint，如 09:30)，每天内按时间先后排列、符合常理(别把午饭排早餐前)**；**每天都填具体日期(date，如 2026-06-19)**，有票/酒店或出发日期时按其推算连续日期；其余选填给不准就留空串。
**prep（行前准备/注意事项）必给**：默认用户从**中国大陆**出发（除非补充里另有说明），据此先判断目的地是否**跨境或跨制式**（如去香港/澳门/台湾/国外）。跨境务必覆盖这些坑：①货币与换汇（带不带现金、当地用什么钱）；②插头电压（如香港英标Type G三脚、日本110V A型，大陆双扁脚插不进要带转换头）；③网络流量（大陆套餐到境外按漫游/未必通，提醒开境外流量包或当地卡/eSIM）；④证件签注（港澳通行证+签注、护照+签证，别只带身份证）；⑤支付方式（能否用支付宝/微信、要不要现金、八达通等当地卡）。国内目的地则按需给（天气穿衣、高反、旺季预约、特殊证件等），不必硬凑货币/插头。每条 title 一句话说清"要做什么"，detail 补原因或怎么做。
**highlights（当季限定）**：判断**目的地是否以某种季节性景观/时令闻名、且恰逢出行月份**——如某城秋日枫叶（北京香山、南京栖霞、长沙岳麓山、苏州天平山等）、春日樱花/桃花、夏日荷花/草原、当地时令美食或限定节庆。给 0~4 条，**只写确有其事、且与出行月份相符的**，写不出就给空数组 []。注意：日落、流星雨、天气、银河这类由系统另行计算，**不要**写进 highlights，避免重复。

**出行体贴三查（务必逐一做到，这是管家高于行程表的关键）**：
① **交通缓冲要留够**：凡高铁/飞机/跨境口岸，都要预留充足时间，并在 timeHint/butlerTip 里写明——高铁提前约 30 分钟到站（取票+安检），机场国内提前 1.5 小时、国际 2~3 小时；**跨境口岸过关单列时间**（如深圳↔香港的福田/罗湖/落马洲/西九龙等，过关+排队常需 30~60 分钟），到站/赶车当天别把行程排满，留出余量。把"前往车站/机场/口岸"本身作为一个 type:"transport" 条目排进去，别让用户以为瞬间到达。
② **无障碍与步行别忽略**：大城市地铁部分老站无电梯、换乘要走很长通道（香港尤其明显），凡涉及地铁/长距离步行，且同行有老人/小孩/推车或带大件行李时，在 butlerTip 提醒"该站无电梯需走楼梯/通道较长，留体力或考虑打车"。
③ **住宿缺口必须查**：逐夜检查"这一晚人在哪个城市、有没有落脚处"。若票据或行程显示某晚会在某城过夜、却没有酒店/住宿安排、用户也没提供，**必须在 prep 里加一条醒目提醒**（category 用"其他"），明确写出，例如"⚠️ X月X日晚你到深圳还没订住宿——要么先订深圳酒店，要么确认当晚过关回香港（含过关时间）"。**绝不默认住宿已安排、绝不跳过这个缺口**。`

export function buildUser(input: any): string {
  const tier = input.budgetTier || '未指定'
  const tags = Array.isArray(input.travelerTags) ? input.travelerTags.join('、') : ''
  const must = Array.isArray(input.mustVisit) ? input.mustVisit.join('、') : (input.mustVisit || '')
  return [
    input.destination ? `我想去${input.destination}玩${input.days}天。` : `帮我安排${input.days}天的行程。`,
    input.departureDate ? `出发日期${input.departureDate}。` : '',
    `节奏：${input.pace || 'balanced'}。同行：${input.companions || 'solo'}。`,
    must ? `必去：${must}。` : '',
    input.avoid ? `避雷：${input.avoid}。` : '',
    `预算：${tier}${input.budgetNote ? '（' + input.budgetNote + '）' : ''}。`,
    tags ? `我的喜好：${tags}。` : '',
    input.travelerNote ? `补充：${input.travelerNote}。` : '',
    input.ticketText
      ? `我已确认的票务/酒店预订如下：「${input.ticketText}」。请把它们**作为行程里的具体条目**排进对应日期：
  - 交通（火车/高铁/机票）：用 type:"transport" 的条目，name 写明车次或航班+出发→到达（如"G304 香港西九龙→武汉"），timeHint 写出发时间，放在该日期当天最前；到达当天别排太满、留接驳时间，返程当天预留赶车余量。
  - 酒店：用 type:"rest" 的条目，name 写"入住 {酒店名}"，在入住当天加一条、离店当天可加退房，area 写酒店位置。
  - 行程天数与起止日期以这些票为准；如果我没单独说目的地，就以票里的到达城市为目的地。`
      : '',
    '请按你管家的风格给我排一版，并严格按规定的 JSON 结构输出。',
  ].filter(Boolean).join('')
}

type Env = Record<string, string | undefined>
type FetchLike = typeof fetch

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function createRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>()
  return (key: string, now = Date.now()) => {
    const current = buckets.get(key)
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }
    if (current.count >= limit) return false
    current.count += 1
    return true
  }
}

const allowAiRequest = createRateLimiter(10, 10 * 60 * 1000)

export async function verifyAccessToken(authHeader: string | undefined, env: Env, fetcher: FetchLike = fetch) {
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new ApiError(401, 'missing access token')

  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new ApiError(500, 'Supabase server config missing')

  const response = await fetcher(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: key, authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError(401, 'invalid access token')
  const user = await response.json() as { id?: string }
  if (!user.id) throw new ApiError(401, 'invalid user')
  return user as { id: string }
}

const isString = (value: unknown): value is string => typeof value === 'string'

export function assertItinerary(value: any) {
  if (!value || typeof value !== 'object') throw new Error('AI 返回格式不完整')
  if (!value.meta || !isString(value.meta.destination)) throw new Error('AI 返回缺少目的地')
  if (!Number.isInteger(value.meta.days) || value.meta.days < 1 || value.meta.days > 15) throw new Error('AI 返回天数无效')
  if (!Array.isArray(value.days) || value.days.length !== value.meta.days) throw new Error('AI 返回行程天数不完整')
  if (!isString(value.greeting) || !isString(value.closing) || !isString(value.disclaimer)) throw new Error('AI 返回文案不完整')
  for (const [dayIndex, day] of value.days.entries()) {
    if (!day || day.dayIndex !== dayIndex + 1 || !isString(day.theme) || !Array.isArray(day.segments)) throw new Error('AI 返回每日结构无效')
    const periods = new Set(day.segments.map((segment: any) => segment?.period))
    if (!['morning', 'afternoon', 'evening'].every((period) => periods.has(period))) throw new Error('AI 返回缺少时段')
    for (const segment of day.segments) {
      if (!Array.isArray(segment.items)) throw new Error('AI 返回时段内容无效')
      for (const item of segment.items) {
        if (!item || !['sight', 'food', 'transport', 'rest', 'activity'].includes(item.type) || !isString(item.name)) {
          throw new Error('AI 返回行程条目无效')
        }
      }
    }
  }
  return value
}

export function validateApiBody(body: any) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'invalid body')
  if (!['plan', 'extract', 'revise'].includes(body.op)) throw new ApiError(400, 'unknown op')
  if (body.op === 'plan') {
    if (!Number.isInteger(body.days) || body.days < 1 || body.days > 15) throw new ApiError(400, 'days must be 1-15')
    if (!isString(body.destination) || !body.destination.trim() || body.destination.length > 100) throw new ApiError(400, 'invalid destination')
  }
  if (body.op === 'extract' && (!isString(body.text) || !body.text.trim() || body.text.length > 20_000)) throw new ApiError(400, 'invalid OCR text')
  if (body.op === 'revise' && (!isString(body.instruction) || !body.instruction.trim() || body.instruction.length > 2_000 || !body.plan)) throw new ApiError(400, 'invalid revision')
}

async function chat(env: Env, messages: any[], opts: { temperature: number; max_tokens: number }) {
  const key = env.DEEPSEEK_API_KEY
  const base = env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const model = env.DEEPSEEK_MODEL || 'deepseek-chat'
  if (!key) throw new Error('DEEPSEEK_API_KEY 未配置')
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, ...opts }),
  })
  if (!r.ok) throw new Error('DeepSeek HTTP ' + r.status)
  const data = (await r.json()) as any
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek 返回空内容')
  return content as string
}

export async function generate(input: any, env: Env) {
  const content = await chat(env, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUser(input) },
  ], { temperature: 1, max_tokens: 8192 })
  return assertItinerary(JSON.parse(content))
}

export const EXTRACT_PROMPT = `你从用户上传截图 OCR 出来的文字里，提取出行预订信息（火车/高铁票、机票、酒店预订等，可能不止一条）。
严格输出 JSON：{"bookings":[{"type":"train|flight|hotel|other","title":"一句话标题","fields":{"中文键":"值"}}]}。
fields 只放确实读到的，键用中文，例如：出发、到达、日期、车次、航班、出发时间、到达时间、入住、离店、酒店、地址、房型、价格、订单号、入住人。读不到就不要编、不要输出空字段。`

export async function extractBookings(text: string, env: Env) {
  const content = await chat(env, [
    { role: 'system', content: EXTRACT_PROMPT },
    { role: 'user', content: '截图 OCR 文字：「' + text + '」' },
  ], { temperature: 0.2, max_tokens: 2048 })
  return JSON.parse(content).bookings || []
}

export async function revise(body: any, env: Env) {
  const user = `这是当前行程 JSON：\n${JSON.stringify(body.plan)}\n\n请按以下要求修改，并输出修改后的【完整】同结构 Itinerary JSON（只动需要改的，其余原样保留；时间/日期保持合理、按时间排序）：${body.instruction}`
  const content = await chat(env, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ], { temperature: 0.5, max_tokens: 8192 })
  return assertItinerary(JSON.parse(content))
}

// 读取请求体（Vercel Node 多数已解析进 req.body，兜底读流）
async function readBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return await new Promise((resolve) => {
    let d = ''
    req.on('data', (c: any) => (d += c))
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

// DeepSeek 生成较慢，给足执行时长（Hobby 上限 60s）
export const config = { maxDuration: 60 }

export async function handleApiRequest(req: any, res: any, env: Env, fetcher: FetchLike = fetch) {
  res.setHeader('content-type', 'application/json')
  if (req.method !== 'POST') {
    res.statusCode = 405
    return res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }))
  }
  let op = ''
  try {
    const contentLength = Number(req.headers?.['content-length'] || 0)
    if (contentLength > 1_000_000) throw new ApiError(413, 'request too large')
    const authHeader = req.headers?.authorization || req.headers?.Authorization
    const user = await verifyAccessToken(authHeader, env, fetcher)
    if (!allowAiRequest(user.id)) throw new ApiError(429, 'rate limit exceeded')

    const body = await readBody(req)
    op = body.op
    validateApiBody(body)
    if (op === 'plan') return res.end(JSON.stringify(await generate(body, env)))
    if (op === 'extract') return res.end(JSON.stringify({ bookings: await extractBookings(body.text, env) }))
    return res.end(JSON.stringify(await revise(body, env)))
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 502
    res.statusCode = status
    const fm = status === 401
      ? '请先登录后再让丸丸规划～'
      : status === 429
        ? '请求有点频繁，歇一会儿再找丸丸吧～'
        : op === 'extract'
          ? '这张图没读清，手动填一下也行～'
          : op === 'revise'
            ? '丸丸没改明白，换句话说说看～'
            : '丸丸这会儿有点忙，稍后再让我排一次好吗～'
    console.error('[api/ai]', { op, status, error: (e as Error).message })
    return res.end(JSON.stringify({ ok: false, friendlyMessage: fm }))
  }
}

// 线上 serverless 入口：POST /api/ai，按 body.op 分发
export default async function handler(req: any, res: any) {
  return handleApiRequest(req, res, process.env)
}
