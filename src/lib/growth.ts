// 丸玩的成长，只认「真实出行」——以景点打卡次数为唯一依据（不认收藏、不认生成行程）。
// docs/08 §6：养成靠真实出行而非收藏。

const TIERS = [
  { min: 0, name: '初心丸子' },
  { min: 3, name: '小小旅人' },
  { min: 8, name: '识途丸子' },
  { min: 15, name: '老练旅人' },
  { min: 30, name: '风物丸子' },
  { min: 60, name: '行脚僧' },
]

export interface Growth {
  lv: number // 等级（从 1 起）
  name: string // 当前称号
  next: number | null // 升到下一级所需打卡数；满级为 null
}

export function growth(checkins: number): Growth {
  let idx = 0
  for (let i = 0; i < TIERS.length; i++) if (checkins >= TIERS[i].min) idx = i
  const next = idx + 1 < TIERS.length ? TIERS[idx + 1].min : null
  return { lv: idx + 1, name: TIERS[idx].name, next }
}

// 打卡里程碑徽章（朱砂小印），到次数才出现
export function badge(checkins: number): string {
  if (checkins >= 50) return '风物志 · 行脚僧'
  if (checkins >= 20) return '资深旅人'
  if (checkins >= 10) return '本地通'
  if (checkins >= 5) return '常客'
  return ''
}
