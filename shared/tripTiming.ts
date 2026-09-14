export type TripTiming = { days?: number; departureDate?: string; tentative?: boolean; question?: string }
const DAY = 86_400_000
const dateValue = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null
}

// Conservative local extraction: unclear dates are asked about, never guessed by the model.
export function tripTiming(description: string, answer = '', openEnded = false, today = new Date()): TripTiming {
  const datePattern = /(?<![\d￥¥])(?:(\d{4})[-/.年])?(\d{1,2})[-/.月](\d{1,2})(?:日|号)?(?![\d元])/g
  const dates: Array<{ date: Date; explicitYear: boolean }> = []
  for (const match of `${description} ${answer}`.matchAll(datePattern)) {
    const year = Number(match[1] || today.getFullYear())
    const date = dateValue(year, Number(match[2]), Number(match[3]))
    if (!date) return { question: '日期好像不太对，请补充有效的起止日期，或直接告诉我玩几天。' }
    dates.push({ date, explicitYear: !!match[1] })
  }
  if (dates.length > 2) return { question: '描述里有多个日期，请只保留本次行程的出发和结束日期，或直接告诉我玩几天。' }
  const departureDate = dates[0]?.date.toISOString().slice(0, 10)
  const numerals: Record<string, number> = { 一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10 }
  const count = (s: string) => /^\d+$/.test(s) ? Number(s) : s.includes('十') ? (numerals[s.split('十')[0]] || 1) * 10 + (numerals[s.split('十')[1]] || 0) : numerals[s]
  const durations = [...`${description} ${answer}`.matchAll(/([0-9]+|[一二两三四五六七八九十]+)\s*(?:天|日游)/g)].map(m => count(m[1]))
  let days = durations.at(-1)
  if (dates.length >= 2) {
    let end = dates[1].date
    // Only infer a year boundary for a December-to-January trip.
    if (end < dates[0].date && !dates[1].explicitYear && dates[0].date.getUTCMonth() === 11 && end.getUTCMonth() === 0) {
      end = new Date(Date.UTC(dates[0].date.getUTCFullYear()+1,0,end.getUTCDate()))
    }
    const rangeDays = Math.round((end.getTime() - dates[0].date.getTime()) / DAY) + 1
    if (rangeDays < 1 || (days && days !== rangeDays)) return { departureDate, question:'日期和天数似乎有冲突，请修改描述，确认这次的起止日期。' }
    days = rangeDays
  }
  if (days !== undefined) {
    if (!Number.isInteger(days) || days < 1 || days > 15) return { departureDate, question:'目前一次最多安排 15 天，请把行程分段，或补充本次要安排的天数。' }
    return { days, departureDate }
  }
  const undecided = openEnded || /(?:结束|返程|回程|回去|回来|归期|行程)?(?:日期|时间)?(?:暂时|还|尚)?(?:没定|未定|不确定)|暂时没有结束日期|还没想好|没想好|不知道|不确定/.test(answer || description)
  if (undecided) return { days: 3, departureDate, tentative: true }
  return { departureDate, question: departureDate ? '准备哪天结束，或一共玩几天？还没定也没关系。' : '准备玩几天，或哪天出发、哪天结束？结束日期还没定也可以。' }
}
