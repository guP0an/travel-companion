// 特殊景观「可遇不可求」——按日期/地点/月相/天气估算当天能否撞见特殊天象/景观。
// 诚实分层：天文事实(日落/月相/流星雨极大)可信；蓝眼泪/银河只给"概率"，明确不打包票。
import type { DayWeather } from './weather'

export interface Phenomenon {
  date: string
  icon: string
  title: string // 一句话
  detail: string // 依据 + 诚实提示
  chance: 'high' | 'medium' | 'low' | 'info' // info=客观信息(如日落时刻)，其余=概率判断
}

// ---- 月相：以 2000-01-06 18:14 UTC 新月为基准，朔望月 29.530588853 天 ----
const SYNODIC = 29.530588853
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14) // ms
// 返回 illum 0(全黑/新月)~1(满月)
function moonIllum(dateISO: string): number {
  const t = Date.parse(dateISO + 'T12:00:00Z')
  if (Number.isNaN(t)) return 0.5
  const days = (t - NEW_MOON_REF) / 86400000
  const phase = ((days % SYNODIC) + SYNODIC) % SYNODIC // 0~29.53
  return (1 - Math.cos((2 * Math.PI * phase) / SYNODIC)) / 2
}
function moonName(illum: number): string {
  if (illum < 0.06) return '新月'
  if (illum < 0.44) return '娥眉月'
  if (illum < 0.56) return '半月'
  if (illum < 0.94) return '凸月'
  return '满月'
}

// ---- 主要流星雨极大期（按月-日匹配，忽略年份）----
const SHOWERS: { name: string; m: number; d: number; zhr: string }[] = [
  { name: '象限仪座流星雨', m: 1, d: 4, zhr: '极盛每小时可达百余颗' },
  { name: '天琴座流星雨', m: 4, d: 22, zhr: '每小时约 18 颗' },
  { name: '宝瓶座η流星雨', m: 5, d: 6, zhr: '每小时约 40 颗' },
  { name: '英仙座流星雨', m: 8, d: 12, zhr: '夏夜王牌，每小时可达百颗' },
  { name: '猎户座流星雨', m: 10, d: 21, zhr: '每小时约 20 颗' },
  { name: '狮子座流星雨', m: 11, d: 17, zhr: '每小时约 15 颗' },
  { name: '双子座流星雨', m: 12, d: 14, zhr: '年度最佳，每小时可达百余颗' },
]
function showerNear(dateISO: string): { name: string; zhr: string; dd: number } | null {
  const [, mm, dd] = dateISO.split('-').map(Number)
  let best: { name: string; zhr: string; dd: number } | null = null
  for (const s of SHOWERS) {
    if (s.m !== mm) continue
    const diff = Math.abs(s.d - dd)
    if (diff <= 2 && (!best || diff < best.dd)) best = { name: s.name, zhr: s.zhr, dd: diff }
  }
  return best
}

// ---- 蓝眼泪：地点关键词 + 季节(4~6月，盛于5月) ----
const BLUETEAR_SPOTS = ['平潭', '霞浦', '福州', '厦门', '马祖', '福建', '泉州', '莆田']
function blueTearSeasonScore(month: number): number {
  if (month === 5) return 1
  if (month === 4 || month === 6) return 0.7
  if (month === 7) return 0.4
  return 0
}

// ---- 银河核心可见季：约 3~10 月，夏季最佳 ----
const STARGAZE_SPOTS = ['沙漠', '敦煌', '茶卡', '阿拉善', '腾格里', '巴丹吉林', '格尔木', '可可西里', '阿里', '那曲', '冷湖', '大柴旦', '戈壁']

function has(city: string, list: string[]): boolean {
  return list.some((k) => city.includes(k))
}

export function phenomena(city: string, days: { date: string }[], weather: Record<string, DayWeather>): Phenomenon[] {
  const out: Phenomenon[] = []
  for (const { date } of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const w = weather[date]
    const month = Number(date.split('-')[1])
    const illum = moonIllum(date)
    const dark = illum < 0.35 // 月光弱，利于看暗天体
    const clear = w ? w.clear : false // 没天气数据时按"未知"，不乐观

    // 1) 日落（客观信息）：有日落时刻就给；天晴标"适合看落日"
    if (w && w.sunset) {
      out.push({
        date,
        icon: '🌅',
        title: `日落 ${w.sunset}${w.clear ? '，天晴适合看落日' : ''}`,
        detail: w.clear ? `日出 ${w.sunrise}。当天通透，火烧云/落日可期。` : `日出 ${w.sunrise}。当天云量偏多，落日可能被云挡。`,
        chance: 'info',
      })
    }

    // 2) 流星雨（天文事实 + 月相/天气调节概率）
    const sh = showerNear(date)
    if (sh) {
      let chance: Phenomenon['chance'] = 'medium'
      if (dark && clear) chance = 'high'
      else if (!clear && w) chance = 'low'
      out.push({
        date,
        icon: '☄️',
        title: `${sh.name}极大期前后`,
        detail: `${sh.zhr}。今晚月相${moonName(illum)}（亮度约${Math.round(illum * 100)}%，${dark ? '月暗、利于观测' : '月明、会盖掉暗流星'}）${w ? '，天气' + w.text + (clear ? '、通透' : '、可能有云') : ''}。找远离城市灯光的暗处、后半夜更好。`,
        chance,
      })
    }

    // 3) 蓝眼泪（仅概率，明确不打包票）
    const season = blueTearSeasonScore(month)
    if (has(city, BLUETEAR_SPOTS) && season > 0) {
      let chance: Phenomenon['chance'] = 'low'
      if (season >= 1 && dark) chance = 'medium'
      out.push({
        date,
        icon: '💙',
        title: '夜里海边或有「蓝眼泪」',
        detail: `${city}属蓝眼泪可能海域，${month}月${season >= 1 ? '正值盛期' : '处季节边缘'}。${dark ? '月色暗、更易看见' : '今晚月较亮、会削弱'}。蓝眼泪受洋流/水温/风向影响大、爆发随机，**只能算概率，不保证一定有**——可关注当地实时播报。`,
        chance,
      })
    }

    // 4) 银河 / 星空（暗天地点 + 银河季 + 月暗 + 天晴）
    if (has(city, STARGAZE_SPOTS) && month >= 3 && month <= 10) {
      let chance: Phenomenon['chance'] = 'medium'
      if (dark && clear) chance = 'high'
      else if (!dark || !clear) chance = 'low'
      out.push({
        date,
        icon: '🌌',
        title: '夜里适合看银河 / 星空',
        detail: `${city}光污染少，${month}月银河核心可见。今晚月相${moonName(illum)}（${dark ? '月暗，银河更清晰' : '月较亮，会冲淡银河'}）${w ? '、天气' + w.text : ''}。后半夜银河更高。`,
        chance,
      })
    }
  }
  return out
}
