import {
  intakeQuestions,
  resolveRelativeDepartureDate,
  type BudgetTier,
  type Companions,
  type IntakeDraft,
  type IntakeResult,
  type Pace,
} from '../shared/planning.js'

export { intakeQuestions, resolveRelativeDepartureDate }

// 丸丸的 AI 接口——serverless 函数。
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

export interface WeatherFact {
  date: string
  text: string
  tMin: number
  tMax: number
  precipitationProbability: number
}

export interface WeatherAlertFact {
  id: string
  event: string
  severity: string
  color: string
  headline: string
  instruction: string
  sender: string
  issuedAt: string
  expiresAt: string
}

interface GeoFact {
  latitude: number
  longitude: number
}

export interface PoiFact {
  query: string
  name: string
  id: string
  location: string
  address: string
  city: string
  openingHours: string
  rating: string
}

export interface RouteFact {
  from: string
  to: string
  distanceMeters: number
  durationMinutes: number
}

export interface TravelFacts {
  weather: WeatherFact[]
  alerts: WeatherAlertFact[]
  pois: PoiFact[]
  routes: RouteFact[]
}

const emptyFacts = (): TravelFacts => ({ weather: [], alerts: [], pois: [], routes: [] })

export function redactSensitiveText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已隐藏]')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[手机号已隐藏]')
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, '[证件号已隐藏]')
    .replace(/((?:订单号|证件号|身份证号?|护照号|手机号|联系人|入住人|乘车人|旅客姓名|姓名)\s*[:：]?\s*)[^\n，,；;]+/g, '$1[已隐藏]')
}

export function buildUser(input: any, facts: TravelFacts = emptyFacts()): string {
  const tier = input.budgetTier || '未指定'
  const tags = Array.isArray(input.travelerTags) ? input.travelerTags.join('、') : ''
  const must = Array.isArray(input.mustVisit) ? input.mustVisit.join('、') : (input.mustVisit || '')
  const weather = facts.weather.length
    ? `已查询到的天气事实（只按这些数据写天气，不要自行补充）：${facts.weather.map((w) => `${w.date} ${w.text} ${w.tMin}~${w.tMax}℃，降水概率${w.precipitationProbability}%`).join('；')}。`
    : ''
  const alerts = facts.alerts.length
    ? `当前生效的官方天气预警（最高优先级）：${facts.alerts.map((alert) => `${alert.color || alert.severity}${alert.event}预警：${alert.headline}${alert.instruction ? `；防御建议：${alert.instruction}` : ''}`).join('；')}。红色/橙色或 severe/extreme 预警下不得安排高风险户外活动，必须在 prep 首项醒目提醒并改成安全的室内替代；黄色或 moderate 预警需增加交通缓冲和装备提醒。不要弱化或改写成普通天气。`
    : ''
  const pois = facts.pois.length
    ? `已核验的地点事实：${facts.pois.map((p) => `${p.name}（${p.address || p.city || '地址未返回'}${p.openingHours ? `，营业时间${p.openingHours}` : ''}）`).join('；')}。未出现在此列表的地点仍需保守表述，不要编精确地址和营业时间。`
    : ''
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
      ? `我已确认的票务/酒店预订如下：「${redactSensitiveText(input.ticketText)}」。请把它们**作为行程里的具体条目**排进对应日期：
  - 交通（火车/高铁/机票）：用 type:"transport" 的条目，name 写明车次或航班+出发→到达（如"G304 香港西九龙→武汉"），timeHint 写出发时间，放在该日期当天最前；到达当天别排太满、留接驳时间，返程当天预留赶车余量。
  - 酒店：用 type:"rest" 的条目，name 写"入住 {酒店名}"，在入住当天加一条、离店当天可加退房，area 写酒店位置。
  - 行程天数与起止日期以这些票为准；如果我没单独说目的地，就以票里的到达城市为目的地。`
      : '',
    weather,
    alerts,
    pois,
    '请按你管家的风格给我排一版，并严格按规定的 JSON 结构输出。',
  ].filter(Boolean).join('')
}

type Env = Record<string, string | undefined>
type FetchLike = typeof fetch

const factRequestInit = () => ({ signal: AbortSignal.timeout(5_000) })

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

const wmoText = (code: number) => {
  if (code === 0) return '晴'
  if (code <= 2) return '多云'
  if (code === 3) return '阴'
  if (code === 45 || code === 48) return '有雾'
  if (code >= 51 && code <= 67) return '有雨'
  if (code >= 71 && code <= 77) return '有雪'
  if (code >= 80 && code <= 82) return '阵雨'
  if (code === 85 || code === 86) return '阵雪'
  if (code >= 95) return '雷雨'
  return '天气情况未知'
}

export function dateRange(start: string, days: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(days) || days < 1 || days > 15) return []
  const first = new Date(`${start}T00:00:00Z`)
  if (Number.isNaN(first.getTime())) return []
  return Array.from({ length: days }, (_, index) => {
    const current = new Date(first)
    current.setUTCDate(first.getUTCDate() + index)
    return current.toISOString().slice(0, 10)
  })
}

export async function geocodeDestination(destination: string, fetcher: FetchLike = fetch): Promise<GeoFact | null> {
  if (!destination.trim()) return null
  try {
    const response = await fetcher(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=zh&format=json`, factRequestInit())
    if (!response.ok) return null
    const geo = await response.json() as any
    const hit = geo.results?.[0]
    const latitude = Number(hit?.latitude)
    const longitude = Number(hit?.longitude)
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
  } catch {
    return null
  }
}

async function collectForecast(input: any, geo: GeoFact | null, fetcher: FetchLike): Promise<WeatherFact[]> {
  const dates = dateRange(input.departureDate || '', input.days)
  if (!geo || dates.length === 0) return []
  try {
    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      `&timezone=auto&start_date=${dates[0]}&end_date=${dates[dates.length - 1]}`
    const forecastResponse = await fetcher(forecastUrl, factRequestInit())
    if (!forecastResponse.ok) return []
    const forecast = await forecastResponse.json() as any
    return (forecast.daily?.time || []).flatMap((date: string, index: number) => {
      const tMax = Math.round(forecast.daily.temperature_2m_max?.[index])
      const tMin = Math.round(forecast.daily.temperature_2m_min?.[index])
      if (!dates.includes(date) || Number.isNaN(tMax) || Number.isNaN(tMin)) return []
      const code = Number(forecast.daily.weather_code?.[index] ?? -1)
      return [{
        date,
        text: wmoText(code),
        tMin,
        tMax,
        precipitationProbability: Number(forecast.daily.precipitation_probability_max?.[index] ?? 0),
      }]
    })
  } catch {
    return []
  }
}

export async function collectWeatherFacts(input: any, fetcher: FetchLike = fetch): Promise<WeatherFact[]> {
  const geo = input.destination ? await geocodeDestination(input.destination, fetcher) : null
  return collectForecast(input, geo, fetcher)
}

const alertWindowIsRelevant = (departureDate: string, now: Date) => {
  if (!departureDate) return true
  const start = new Date(`${departureDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return false
  const daysAway = (start.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000
  return daysAway >= -1 && daysAway <= 7
}

const cleanAlertText = (value: unknown, maxLength = 500) =>
  isString(value) ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : ''

export async function collectWeatherAlerts(
  input: any,
  env: Env,
  fetcher: FetchLike = fetch,
  geo?: GeoFact | null,
  now = new Date(),
): Promise<WeatherAlertFact[]> {
  const key = env.QWEATHER_API_KEY
  const host = (env.QWEATHER_API_HOST || '').trim().toLowerCase()
  if (!key || !/^[a-z0-9.-]+\.qweatherapi\.com$/.test(host) || !alertWindowIsRelevant(input.departureDate || '', now)) return []
  const location = geo === undefined ? await geocodeDestination(input.destination || '', fetcher) : geo
  if (!location) return []
  try {
    const latitude = location.latitude.toFixed(2)
    const longitude = location.longitude.toFixed(2)
    const response = await fetcher(`https://${host}/weatheralert/v1/current/${latitude}/${longitude}?lang=zh&localTime=true`, {
      ...factRequestInit(),
      headers: { 'X-QW-Api-Key': key },
    })
    if (!response.ok) return []
    const data = await response.json() as any
    return (Array.isArray(data.alerts) ? data.alerts : [])
      .filter((alert: any) => alert?.messageType?.code !== 'cancel')
      .filter((alert: any) => !alert.expireTime || Number.isNaN(Date.parse(alert.expireTime)) || Date.parse(alert.expireTime) > now.getTime())
      .slice(0, 5)
      .map((alert: any) => ({
        id: cleanAlertText(alert.id, 120),
        event: cleanAlertText(alert.eventType?.name, 60) || '天气灾害',
        severity: cleanAlertText(alert.severity, 30),
        color: cleanAlertText(alert.color?.code, 20),
        headline: cleanAlertText(alert.headline, 300) || cleanAlertText(alert.description, 300),
        instruction: cleanAlertText(alert.instruction, 600),
        sender: cleanAlertText(alert.senderName, 100),
        issuedAt: cleanAlertText(alert.issuedTime, 60),
        expiresAt: cleanAlertText(alert.expireTime, 60),
      }))
  } catch {
    return []
  }
}

export function attachWeatherAlerts(plan: any, alerts: WeatherAlertFact[]) {
  if (alerts.length === 0) return plan
  const existing = Array.isArray(plan.weatherAlerts) ? plan.weatherAlerts : []
  return { ...plan, weatherAlerts: [...alerts, ...existing.filter((item: any) => !alerts.some((alert) => alert.id && alert.id === item?.id))].slice(0, 5) }
}

export async function searchAmapPoi(query: string, region: string, key: string, fetcher: FetchLike = fetch): Promise<PoiFact | null> {
  if (!query.trim() || !key) return null
  try {
    const params = new URLSearchParams({ key, keywords: query.trim(), region: region.trim(), page_size: '1', show_fields: 'business' })
    const response = await fetcher(`https://restapi.amap.com/v5/place/text?${params}`, factRequestInit())
    if (!response.ok) return null
    const data = await response.json() as any
    const poi = data.status === '1' ? data.pois?.[0] : null
    if (!poi?.id || !poi?.location) return null
    return {
      query,
      name: poi.name || query,
      id: poi.id,
      location: poi.location,
      address: Array.isArray(poi.address) ? poi.address.join('') : (poi.address || ''),
      city: poi.cityname || '',
      openingHours: poi.business?.opentime_week || poi.business?.opentime_today || '',
      rating: poi.business?.rating || '',
    }
  } catch {
    return null
  }
}

export async function fetchWalkingRoute(from: PoiFact, to: PoiFact, key: string, fetcher: FetchLike = fetch): Promise<RouteFact | null> {
  try {
    const params = new URLSearchParams({
      key,
      origin: from.location,
      destination: to.location,
      origin_id: from.id,
      destination_id: to.id,
      show_fields: 'cost',
    })
    const response = await fetcher(`https://restapi.amap.com/v5/direction/walking?${params}`, factRequestInit())
    if (!response.ok) return null
    const data = await response.json() as any
    const path = data.status === '1' ? data.route?.paths?.[0] : null
    const distanceMeters = Number(path?.distance)
    const durationSeconds = Number(path?.cost?.duration || path?.duration)
    if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) return null
    return { from: from.name, to: to.name, distanceMeters, durationMinutes: Math.max(1, Math.round(durationSeconds / 60)) }
  } catch {
    return null
  }
}

const itineraryPlaceNames = (plan: any): string[] => {
  const names = (plan.days || []).flatMap((day: any) =>
    (day.segments || []).flatMap((segment: any) =>
      (segment.items || [])
        .filter((item: any) => ['sight', 'food', 'activity', 'rest'].includes(item.type))
        .map((item: any) => item.name),
    ),
  )
  const validNames = names.filter((name: unknown): name is string => isString(name) && name.trim().length > 1) as string[]
  return [...new Set<string>(validNames)].slice(0, 12)
}

const itineraryPlacePairs = (plan: any): Array<[string, string]> =>
  (plan.days || []).flatMap((day: any) => {
    const names = (day.segments || []).flatMap((segment: any) =>
      (segment.items || [])
        .filter((item: any) => ['sight', 'food', 'activity', 'rest'].includes(item.type))
        .map((item: any) => item.name)
        .filter((name: unknown): name is string => isString(name) && name.trim().length > 1),
    )
    return names.slice(1).map((name: string, index: number) => [names[index], name] as [string, string])
  })

export async function collectAmapFacts(plan: any, input: any, env: Env, fetcher: FetchLike = fetch): Promise<Pick<TravelFacts, 'pois' | 'routes'>> {
  const key = env.AMAP_WEB_SERVICE_KEY
  if (!key) return { pois: [], routes: [] }
  const queries = [...new Set([
    ...(Array.isArray(input.mustVisit) ? input.mustVisit : []),
    ...itineraryPlaceNames(plan),
  ])].slice(0, 12)
  const pois = (await Promise.all(queries.map((query) => searchAmapPoi(query, input.destination || '', key, fetcher))))
    .filter((poi): poi is PoiFact => Boolean(poi))
  const poiByQuery = new Map(pois.map((poi) => [poi.query, poi]))
  const routes = (await Promise.all(itineraryPlacePairs(plan).slice(0, 8).map(([fromName, toName]) => {
    const from = poiByQuery.get(fromName)
    const to = poiByQuery.get(toName)
    return from && to ? fetchWalkingRoute(from, to, key, fetcher) : null
  }))).filter((route): route is RouteFact => Boolean(route))
  return { pois, routes }
}

export function groundingIssues(plan: any, facts: TravelFacts): string[] {
  const verifiedQueries = new Set(facts.pois.flatMap((poi) => [poi.query, poi.name]))
  const missing = itineraryPlaceNames(plan).filter((name) => !verifiedQueries.has(name))
  const longWalks = facts.routes.filter((route) => route.distanceMeters > 3500 || route.durationMinutes > 60)
  return [
    ...(missing.length ? [`以下地点未被地图数据核验：${missing.join('、')}。不要写精确地址/营业时间，并将 confidence 调为 medium 或 low。`] : []),
    ...longWalks.map((route) => `${route.from}到${route.to}步行约${route.distanceMeters}米/${route.durationMinutes}分钟，需要改为公共交通、打车或调整同日顺序。`),
  ]
}

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
  if (!['intake', 'plan', 'extract', 'vision', 'revise'].includes(body.op)) throw new ApiError(400, 'unknown op')
  if (body.op === 'intake') {
    if (!isString(body.request) || !body.request.trim() || body.request.length > 2_000) throw new ApiError(400, 'invalid intake request')
    if (!Number.isInteger(body.days) || body.days < 1 || body.days > 15) throw new ApiError(400, 'days must be 1-15')
    if (body.today && (!isString(body.today) || !/^\d{4}-\d{2}-\d{2}$/.test(body.today))) throw new ApiError(400, 'invalid today')
    if (body.answer && (!isString(body.answer) || body.answer.length > 2_000)) throw new ApiError(400, 'invalid intake answer')
    if (body.draft && (typeof body.draft !== 'object' || JSON.stringify(body.draft).length > 10_000)) throw new ApiError(400, 'invalid intake draft')
  }
  if (body.op === 'plan') {
    if (!Number.isInteger(body.days) || body.days < 1 || body.days > 15) throw new ApiError(400, 'days must be 1-15')
    const destination = isString(body.destination) ? body.destination.trim() : ''
    const ticketText = isString(body.ticketText) ? body.ticketText.trim() : ''
    if ((!destination && !ticketText) || destination.length > 100 || ticketText.length > 20_000) throw new ApiError(400, 'invalid plan input')
  }
  if (body.op === 'extract' && (!isString(body.text) || !body.text.trim() || body.text.length > 20_000)) throw new ApiError(400, 'invalid OCR text')
  if (body.op === 'vision') validateVisionDataUrl(body.image)
  if (body.op === 'revise' && (!isString(body.instruction) || !body.instruction.trim() || body.instruction.length > 2_000 || !body.plan)) throw new ApiError(400, 'invalid revision')
}

async function chat(env: Env, messages: any[], opts: { temperature: number; max_tokens: number }, fetcher: FetchLike = fetch) {
  const key = env.DEEPSEEK_API_KEY
  const base = env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const model = env.DEEPSEEK_MODEL || 'deepseek-chat'
  if (!key) throw new Error('DEEPSEEK_API_KEY 未配置')
  const r = await fetcher(`${base}/chat/completions`, {
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

const INTAKE_PROMPT = `你是旅行规划前置助手。根据用户原始诉求、页面默认值、上一轮已识别内容和本轮回答，提取最新信息。
只输出 JSON，不要解释：
{"departureCity":"","destination":"","countryOnly":false,"international":false,"departureDate":"","days":3,"weekendMentioned":false,"companions":"","pace":"balanced","budgetTier":"moderate","travelerNote":""}
规则：
- destination 写城市或国家；如果用户只说国家，countryOnly=true。
- international 表示相对中国大陆是否出境。
- departureDate 只写用户明确给出的 YYYY-MM-DD；“这周末”等相对日期留空，由系统计算。
- companions 只能是 solo/couple/friends/family/other 或空串。
- pace 只能是 packed/balanced/leisurely；budgetTier 只能是 budget/moderate/comfort/custom。
- 本轮短回答用于补齐或修正上一轮，不能丢掉已经明确的信息；不要猜出发城市、目的城市、同行人。`

const enumValue = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? value as T : fallback

export async function intake(body: any, env: Env, fetcher: FetchLike = fetch): Promise<IntakeResult> {
  const content = await chat(env, [
    { role: 'system', content: INTAKE_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        request: body.request,
        today: body.today || '',
        timezone: body.timezone || 'Asia/Shanghai',
        pageDefaults: { days: body.days, pace: body.pace || 'balanced' },
        previous: body.draft || null,
        answer: body.answer || '',
      }),
    },
  ], { temperature: 0.1, max_tokens: 1024 }, fetcher)
  const parsed = JSON.parse(content)
  const previous = body.draft && typeof body.draft === 'object' ? body.draft : {}
  const combinedText = `${body.request} ${body.answer || ''}`
  const relativeDate = resolveRelativeDepartureDate(combinedText, body.today || '')
  const pace = enumValue<Pace>(parsed.pace, ['packed', 'balanced', 'leisurely'], previous.pace || body.pace || 'balanced')
  const budgetTier = enumValue<BudgetTier>(parsed.budgetTier, ['budget', 'moderate', 'comfort', 'custom'], previous.budgetTier || body.budgetTier || 'moderate')
  const companions = enumValue<'' | Companions>(parsed.companions, ['', 'solo', 'couple', 'friends', 'family', 'other'], previous.companions || '')
  const draft: IntakeDraft = {
    request: body.request.trim(),
    departureCity: isString(parsed.departureCity) ? parsed.departureCity.trim() : (previous.departureCity || ''),
    destination: isString(parsed.destination) ? parsed.destination.trim() : (previous.destination || ''),
    countryOnly: parsed.countryOnly === true,
    international: parsed.international === true,
    departureDate: relativeDate || (isString(parsed.departureDate) ? parsed.departureDate : previous.departureDate || ''),
    days: Number.isInteger(parsed.days) && parsed.days >= 1 && parsed.days <= 15 ? parsed.days : body.days,
    weekendMentioned: parsed.weekendMentioned === true || /(这|本)周末/.test(combinedText),
    companions,
    pace,
    budgetTier,
    travelerNote: isString(parsed.travelerNote) ? parsed.travelerNote.trim() : (previous.travelerNote || ''),
  }
  const questions = intakeQuestions(draft)
  if (questions.length) return { status: 'needs_input', questions, draft }
  return {
    status: 'ready',
    input: {
      destination: draft.destination,
      departureCity: draft.departureCity,
      departureDate: draft.departureDate,
      days: draft.days,
      pace: draft.pace,
      companions: draft.companions || 'solo',
      budgetTier: draft.budgetTier,
      budgetNote: body.budgetNote,
      mustVisit: body.mustVisit,
      avoid: body.avoid,
      travelerTags: body.travelerTags,
      travelerNote: draft.travelerNote,
      ticketText: body.ticketText,
    },
  }
}

export async function generate(input: any, env: Env, fetcher: FetchLike = fetch) {
  const geo = input.destination ? await geocodeDestination(input.destination, fetcher) : null
  const [weather, alerts] = await Promise.all([
    collectForecast(input, geo, fetcher),
    collectWeatherAlerts(input, env, fetcher, geo),
  ])
  const content = await chat(env, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUser(input, { weather, alerts, pois: [], routes: [] }) },
  ], { temperature: 1, max_tokens: 8192 }, fetcher)
  const draft = assertItinerary(JSON.parse(content))
  if (!env.AMAP_WEB_SERVICE_KEY) return attachWeatherAlerts(draft, alerts)
  const amap = await collectAmapFacts(draft, input, env, fetcher)
  if (amap.pois.length === 0) return attachWeatherAlerts(draft, alerts)
  const facts = { weather, alerts, ...amap }
  const issues = groundingIssues(draft, facts)
  if (issues.length === 0) return attachWeatherAlerts(draft, alerts)

  const repairPrompt = `这是当前行程 JSON：\n${JSON.stringify(draft)}\n\n这是工具核验结果：\n${issues.join('\n')}\n\n请只修复上述问题，保留其余内容，输出完整同结构 JSON。不得新增工具未证实的精确地址、营业时间或票价。`
  const repaired = await chat(env, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: repairPrompt },
  ], { temperature: 0.3, max_tokens: 8192 }, fetcher)
  return attachWeatherAlerts(assertItinerary(JSON.parse(repaired)), alerts)
}

export const EXTRACT_PROMPT = `你从用户上传截图 OCR 出来的文字里，提取出行预订信息（火车/高铁票、机票、酒店预订等，可能不止一条）。
严格输出 JSON：{"bookings":[{"type":"train|flight|hotel|other","title":"一句话标题","fields":{"中文键":"值"}}]}。
fields 只放规划所需且确实读到的，键用中文，例如：出发、到达、日期、车次、航班、出发时间、到达时间、入住、离店、酒店、地址、房型、价格。价格/票价/实付金额是自动记账的关键字段，只要图片或文字中可见就必须提取并统一使用键“价格”。不要输出姓名、手机号、证件号、订单号等个人信息；读不到就不要编、不要输出空字段。`

const normalizeBookings = (value: any) => {
  const bookings = Array.isArray(value?.bookings) ? value.bookings : []
  return bookings.slice(0, 12).map((booking: any) => ({
    type: ['train', 'flight', 'hotel', 'other'].includes(booking?.type) ? booking.type : 'other',
    title: cleanAlertText(booking?.title, 120) || '识别到的预订',
    fields: Object.fromEntries(
      Object.entries(booking?.fields || {})
        .filter(([key, fieldValue]) => !/姓名|手机号|证件|身份证|护照|订单|乘客|旅客|联系人/.test(key) && isString(fieldValue))
        .slice(0, 30)
        .map(([key, fieldValue]) => [cleanAlertText(key, 40), cleanAlertText(fieldValue, 300)]),
    ),
  }))
}

export function validateVisionDataUrl(value: unknown): string {
  if (!isString(value)) throw new ApiError(400, 'invalid image')
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw new ApiError(400, 'invalid image format')
  const estimatedBytes = Math.floor(match[2].length * 3 / 4)
  if (estimatedBytes < 32 || estimatedBytes > 2_000_000) throw new ApiError(413, 'image too large')
  return value
}

export async function extractBookingsFromImage(image: string, env: Env, fetcher: FetchLike = fetch) {
  const key = env.MOONSHOT_API_KEY || env.KIMI_API_KEY
  const base = (env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/$/, '')
  const model = env.KIMI_VISION_MODEL || 'kimi-k2.6'
  if (!key) throw new Error('MOONSHOT_API_KEY 未配置')
  const response = await fetcher(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACT_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: validateVisionDataUrl(image) } },
            { type: 'text', text: '直接识别这张出行预订截图。只输出规定的 JSON，不要描述图片。' },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`Kimi Vision HTTP ${response.status}`)
  const data = await response.json() as any
  const content = data.choices?.[0]?.message?.content
  if (!isString(content) || !content.trim()) throw new Error('Kimi Vision 返回空内容')
  return normalizeBookings(JSON.parse(content))
}

export async function extractBookings(text: string, env: Env, fetcher: FetchLike = fetch) {
  const content = await chat(env, [
    { role: 'system', content: EXTRACT_PROMPT },
    { role: 'user', content: '截图 OCR 文字：「' + redactSensitiveText(text) + '」' },
  ], { temperature: 0.2, max_tokens: 2048 }, fetcher)
  return normalizeBookings(JSON.parse(content))
}

export async function revise(body: any, env: Env, fetcher: FetchLike = fetch) {
  const user = `这是当前行程 JSON：\n${JSON.stringify(body.plan)}\n\n请按以下要求修改，并输出修改后的【完整】同结构 Itinerary JSON（只动需要改的，其余原样保留；时间/日期保持合理、按时间排序）：${body.instruction}`
  const content = await chat(env, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ], { temperature: 0.5, max_tokens: 8192 }, fetcher)
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
    if (contentLength > 3_000_000) throw new ApiError(413, 'request too large')
    const authHeader = req.headers?.authorization || req.headers?.Authorization
    const user = await verifyAccessToken(authHeader, env, fetcher)
    if (!allowAiRequest(user.id)) throw new ApiError(429, 'rate limit exceeded')

    const body = await readBody(req)
    op = body.op
    validateApiBody(body)
    if (op === 'intake') return res.end(JSON.stringify(await intake(body, env, fetcher)))
    if (op === 'plan') return res.end(JSON.stringify(await generate(body, env, fetcher)))
    if (op === 'extract') return res.end(JSON.stringify({ bookings: await extractBookings(body.text, env, fetcher) }))
    if (op === 'vision') return res.end(JSON.stringify({ bookings: await extractBookingsFromImage(body.image, env, fetcher), provider: 'kimi-k2.6' }))
    return res.end(JSON.stringify(await revise(body, env, fetcher)))
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 502
    res.statusCode = status
    const fm = status === 401
      ? '请先登录后再让丸丸规划～'
      : status === 429
        ? '请求有点频繁，歇一会儿再找丸丸吧～'
        : op === 'extract' || op === 'vision'
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
