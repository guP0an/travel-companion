// 行程数据模型 —— 前端渲染、模型输出、云端存储三者共用的契约。
// 对齐 docs/04-architecture-and-data-model.md §3。

export interface Itinerary {
  meta: ItineraryMeta
  greeting: string // 管家开场白（带性格）
  days: DayPlan[] // 长度 = meta.days
  closing: string // 结语
  disclaimer: string // 真实性免责提示
}

export interface ItineraryMeta {
  destination: string
  days: number // 1–15
  departureDate: string // ISO 日期 或 ""
  pace: 'packed' | 'balanced' | 'leisurely' // 节奏：紧凑/适中/溜达
  companions: 'solo' | 'couple' | 'friends' | 'family' | 'other' // 同行人
  mustVisit: string[] // 必去清单（强约束）
  avoid: string // 避雷（负约束），"" 表示无
  budgetTier: 'budget' | 'moderate' | 'comfort' | 'custom'
  budgetNote: string // "" 表示未提供
  travelerTags: string[] // 软性标签：作息/兴趣/怕排队/交通偏好…
  travelerNote: string // 自由文本兜底（住处位置等）
  season: string // 管家据出发日期推断的季节提示，可为 ""
}

export interface DayPlan {
  dayIndex: number // 从 1 开始
  date: string // "" 表示未排具体日期
  theme: string // 当天主题，如「东山慢走」
  segments: Segment[] // 固定 3 段：上午/下午/晚上
}

export type Period = 'morning' | 'afternoon' | 'evening'

export interface Segment {
  period: Period
  items: Item[]
}

export type ItemType = 'sight' | 'food' | 'transport' | 'rest' | 'activity'

export interface Item {
  type: ItemType
  name: string // 地点/店名/活动名
  area: string // 所在区域
  why: string // 一句为什么推荐（管家视角）
  butlerTip: string // "" 或贴心提醒
  timeHint: string // "" 或时间提示
  durationHint: string // "" 或「约 2 小时」
  costHint: string // "" 或「人均 80 元」
  imageQuery: string // 取真实配图用的检索词，如「京都 清水寺」（模型不编 URL）
  confidence: 'high' | 'medium' | 'low' // 真实性自评
}
