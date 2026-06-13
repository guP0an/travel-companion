import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 丸丸的生成规则（system prompt）。DeepSeek 用 json_object，故在这里把目标结构讲清楚。
const SYSTEM_PROMPT = `你是「丸丸」，一个温柔、贴心、记得用户脾气的旅行管家、旅伴，不是冷冰冰的工具。
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
  "disclaimer": "行程由 AI 生成，景点营业时间/价格请出行前再核实一次。"
}
要求：按节奏定密度（紧凑多排、溜达留白）；必去清单必须排进去；避雷里的回避；照顾同行人（带娃/带老人降强度）；**每条都给具体开始时间(timeHint，如 09:30)，每天内按时间先后排列、符合常理(别把午饭排早餐前)**；其余选填给不准就留空串。`

function buildUser(input: any): string {
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

function readJson(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let d = ''
    req.on('data', (c: any) => (d += c))
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

async function generate(input: any, env: Record<string, string>) {
  const key = env.DEEPSEEK_API_KEY
  const base = env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const model = env.DEEPSEEK_MODEL || 'deepseek-chat'
  if (!key) throw new Error('DEEPSEEK_API_KEY 未配置')
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUser(input) },
      ],
      response_format: { type: 'json_object' },
      temperature: 1,
      max_tokens: 8192,
    }),
  })
  if (!r.ok) throw new Error('DeepSeek HTTP ' + r.status + ' ' + (await r.text()))
  const data = (await r.json()) as any
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek 返回空内容')
  return JSON.parse(content)
}

const EXTRACT_PROMPT = `你从用户上传截图 OCR 出来的文字里，提取出行预订信息（火车/高铁票、机票、酒店预订等，可能不止一条）。
严格输出 JSON：{"bookings":[{"type":"train|flight|hotel|other","title":"一句话标题","fields":{"中文键":"值"}}]}。
fields 只放确实读到的，键用中文，例如：出发、到达、日期、车次、航班、出发时间、到达时间、入住、离店、酒店、地址、房型、价格、订单号、入住人。读不到就不要编、不要输出空字段。`

async function extractBookings(text: string, env: Record<string, string>) {
  const key = env.DEEPSEEK_API_KEY
  const base = env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const model = env.DEEPSEEK_MODEL || 'deepseek-chat'
  if (!key) throw new Error('DEEPSEEK_API_KEY 未配置')
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: EXTRACT_PROMPT },
        { role: 'user', content: '截图 OCR 文字：「' + text + '」' },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2048,
    }),
  })
  if (!r.ok) throw new Error('DeepSeek HTTP ' + r.status + ' ' + (await r.text()))
  const data = (await r.json()) as any
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek 返回空内容')
  return JSON.parse(content).bookings || []
}

// 本地 serverless 代理：藏 DeepSeek key（用 process 环境，不进前端 bundle）
function deepseekApi(env: Record<string, string>): Plugin {
  return {
    name: 'deepseek-api',
    configureServer(server) {
      server.middlewares.use('/api/plan', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        res.setHeader('content-type', 'application/json')
        try {
          const body = await readJson(req)
          const plan = await generate(body, env)
          res.end(JSON.stringify(plan))
        } catch (e) {
          res.end(
            JSON.stringify({
              ok: false,
              friendlyMessage: '丸丸这会儿有点忙，稍后再让我排一次好吗～',
              error: String((e as Error).message),
            }),
          )
        }
      })

      server.middlewares.use('/api/extract', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        res.setHeader('content-type', 'application/json')
        try {
          const body = await readJson(req)
          const bookings = await extractBookings(String(body.text || ''), env)
          res.end(JSON.stringify({ bookings }))
        } catch (e) {
          res.end(JSON.stringify({ ok: false, friendlyMessage: '这张图没读清，手动填一下也行～', error: String((e as Error).message) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), deepseekApi(env)],
  }
})
