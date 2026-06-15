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

// ---- 地点+季节型景观目录（搜罗核准的季节/地点）----
type SceneKind = 'cloudsea' | 'goldenmt' | 'buddhalight' | 'rime' | 'aurora' | 'skymirror' | 'firefly' | 'foliage' | 'flower' | 'tide'
const SCENES: { icon: string; title: string; spots: string[]; months: number[]; kind: SceneKind; note: string }[] = [
  { icon: '🌫️', title: '清晨或见云海', spots: ['黄山', '峨眉', '泰山', '华山', '庐山', '衡山', '三清山', '武功山', '牛背山', '老君山', '轿子雪山', '梵净山', '武当', '苍山'], months: [10, 11, 12, 1, 2, 3, 4], kind: 'cloudsea', note: '' },
  { icon: '🏔️', title: '日出/日落或现「日照金山」', spots: ['梅里', '卡瓦格博', '贡嘎', '南迦巴瓦', '珠峰', '珠穆朗玛', '四姑娘', '玉龙雪山', '稻城', '亚丁', '雀儿山', '年保玉则', '雅拉'], months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], kind: 'goldenmt', note: '' },
  { icon: '🌈', title: '或有「佛光」', spots: ['峨眉', '黄山', '牛背山'], months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], kind: 'buddhalight', note: '' },
  { icon: '🌲', title: '雾凇（树挂）', spots: ['吉林', '雾凇岛', '雪乡', '长白山', '阿尔山'], months: [12, 1, 2], kind: 'rime', note: '' },
  { icon: '🌠', title: '或有北极光', spots: ['漠河', '北极村', '洛古河'], months: [1, 2, 3, 9, 10, 11, 12], kind: 'aurora', note: '' },
  { icon: '🪞', title: '盐湖「天空之镜」', spots: ['茶卡', '察尔汗', '东台吉乃尔', '艾肯泉', '翡翠湖', '大柴旦'], months: [6, 7, 8, 9, 10], kind: 'skymirror', note: '' },
  { icon: '✨', title: '夜里或见萤火虫', spots: ['西双版纳', '天台山', '瑞金', '紫金山', '南京', '梅州', '龙门', '九寨'], months: [5, 6, 7], kind: 'firefly', note: '' },
  { icon: '🍁', title: '秋色红叶正盛', spots: ['香山', '喀纳斯', '光雾山', '米亚罗', '九寨', '栖霞', '本溪', '塔川', '坝上'], months: [10, 11], kind: 'foliage', note: '层林尽染，正是观叶时节' },
  { icon: '🌳', title: '额济纳胡杨金黄', spots: ['额济纳', '胡杨', '塔里木'], months: [10], kind: 'foliage', note: '10 月初至中旬胡杨最盛' },
  { icon: '🌸', title: '林芝桃花盛放', spots: ['林芝', '波密', '巴宜', '嘎拉'], months: [3, 4], kind: 'flower', note: '雪山下的桃花沟，3 月中至 4 月初最美' },
  { icon: '🌼', title: '婺源油菜花海', spots: ['婺源', '篁岭'], months: [3, 4], kind: 'flower', note: '梯田油菜花 3 月最盛，篁岭高山花海 3 月底接力' },
  { icon: '🌼', title: '罗平油菜花海', spots: ['罗平'], months: [2, 3], kind: 'flower', note: '早春油菜花海' },
  { icon: '💜', title: '伊犁薰衣草', spots: ['伊犁', '霍城', '那拉提', '解忧'], months: [6, 7], kind: 'flower', note: '初夏薰衣草盛放' },
  { icon: '🌊', title: '钱塘江大潮', spots: ['海宁', '盐官', '钱塘', '萧山', '下沙', '丁桥'], months: [8, 9, 10], kind: 'tide', note: '' },
]

export function phenomena(city: string, days: { date: string }[], weather: Record<string, DayWeather>): Phenomenon[] {
  const out: Phenomenon[] = []
  const seenInfo = new Set<string>() // 季节型(info)景观整趟只提一次，避免每天刷屏
  for (const { date } of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const w = weather[date]
    const month = Number(date.split('-')[1])
    const illum = moonIllum(date)
    const dark = illum < 0.35 // 月光弱，利于看暗天体
    const clear = w ? w.clear : false // 没天气数据时按"未知"，不乐观

    // 1) 日落：只有天气通透(晴/多云)才算"可遇景观"；阴雨天看不到落日，不列出来误导
    if (w && w.sunset && w.clear && w.pop < 50) {
      out.push({
        date,
        icon: '🌅',
        title: `日落 ${w.sunset}，天晴适合看落日`,
        detail: `日出 ${w.sunrise}。当天通透，火烧云 / 落日可期。`,
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

    // 5) 地点+季节型景观目录
    for (const s of SCENES) {
      if (!has(city, s.spots) || !s.months.includes(month)) continue
      let chance: Phenomenon['chance'] = 'info'
      let detail = ''
      switch (s.kind) {
        case 'cloudsea':
          chance = clear ? 'medium' : 'low'
          detail = `雨后初晴的清晨最易翻涌云海；${clear ? '今日通透、有戏' : '今日云量偏多'}。`
          break
        case 'goldenmt':
          chance = clear ? 'high' : 'low'
          detail = `${clear ? '今日晴朗' : '今日多云、金顶可能被云挡'}，${w && w.sunrise ? `日出 ${w.sunrise} / 日落 ${w.sunset} 前后金顶最美` : '清晨与黄昏金顶最美'}。`
          break
        case 'buddhalight':
          chance = 'low'
          detail = '需立于云雾之上、阳光在身后，水汽折射成彩色光环；罕见，可遇不可求。'
          break
        case 'rime': {
          const cold = !!w && w.tMin <= -5
          chance = cold ? 'medium' : 'low'
          detail = `需严寒 + 江面水汽，${w ? `当日最低 ${w.tMin}°，${cold ? '够冷、有机会' : '偏暖、概率小'}` : '清晨最盛'}；雾凇多在日出后渐显、上午渐融。`
          break
        }
        case 'aurora':
          chance = 'low'
          detail = '需强地磁暴 + 晴夜 + 无月光，极难得；出行前可关注空间天气 Kp 指数预报。'
          break
        case 'skymirror':
          chance = clear ? 'medium' : 'low'
          detail = `需薄水层 + 无风 + 晴天，倒影才完美；${clear ? '今日晴' : '今日多云'}，清晨或傍晚光线最柔。`
          break
        case 'firefly': {
          const ok = !!w && w.pop < 50 && w.tMin >= 15
          chance = ok ? 'medium' : 'low'
          detail = '温暖无雨的夜晚、近水草丛最多；雨天或低温不易出没。'
          break
        }
        case 'foliage':
        case 'flower':
          chance = 'info'
          detail = s.note + (s.kind === 'flower' ? '（花期随当年气温浮动，出行前查当年花情预报更准）' : '')
          break
        case 'tide':
          chance = 'info'
          detail = '农历八月十八前后（约阳历 9 月中下旬）大潮最盛；每月农历初一、十五前后亦为大潮。观潮务必远离潮线、听从安全提示。'
          break
      }
      // 季节型(info)整趟只提一次
      if (chance === 'info') {
        if (seenInfo.has(s.title)) continue
        seenInfo.add(s.title)
      }
      out.push({ date, icon: s.icon, title: s.title, detail, chance })
    }

    // 6) 满月（客观信息，亮且会盖掉暗天体）
    if (illum > 0.96) {
      out.push({ date, icon: '🌕', title: '今晚接近满月', detail: `月色明亮（约 ${Math.round(illum * 100)}%），适合赏月；但会盖掉流星与银河。`, chance: 'info' })
    }
  }
  return out
}
