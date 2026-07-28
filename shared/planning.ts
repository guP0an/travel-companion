export type Pace = 'packed' | 'balanced' | 'leisurely'
export type Companions = 'solo' | 'couple' | 'friends' | 'family' | 'other'
export type BudgetTier = 'budget' | 'moderate' | 'comfort' | 'custom'

export interface IntakeDraft {
  request: string
  departureCity: string
  destination: string
  countryOnly: boolean
  international: boolean
  departureDate: string
  days: number
  weekendMentioned: boolean
  companions: '' | Companions
  pace: Pace
  budgetTier: BudgetTier
  travelerNote: string
}

export interface NormalizedPlanInput {
  destination: string
  departureCity: string
  departureDate: string
  days: number
  pace: Pace
  companions: Companions
  budgetTier: BudgetTier
  budgetNote?: string
  mustVisit?: string[]
  avoid?: string
  travelerTags?: string[]
  travelerNote: string
  ticketText?: string
}

export type IntakeResult =
  | { status: 'needs_input'; questions: string[]; draft: IntakeDraft }
  | { status: 'ready'; input: NormalizedPlanInput }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const cnDate = (date: string) => {
  const [, month, day] = date.split('-').map(Number)
  return `${month}月${day}日`
}

const cnDateRange = (start: string, end: string) => {
  const [, startMonth] = start.split('-').map(Number)
  const [, endMonth, endDay] = end.split('-').map(Number)
  return `${cnDate(start)}至${startMonth === endMonth ? `${endDay}日` : cnDate(end)}`
}

export function resolveRelativeDepartureDate(text: string, today: string): string {
  return resolveRelativeTripRange(text, today)?.departureDate || ''
}

export function resolveRelativeTripRange(text: string, today: string): { departureDate: string; days?: number } | null {
  if (!ISO_DATE.test(today)) return null
  const compact = text.replace(/\s+/g, '')
  const date = new Date(`${today}T00:00:00Z`)
  if (/(?:这|本)?周五(?:到|至|-)(?:这|本)?周日/.test(compact)) {
    const untilFriday = (5 - date.getUTCDay() + 7) % 7
    return { departureDate: addDays(today, untilFriday), days: 3 }
  }
  if (!/(这|本)周末/.test(compact)) return null
  const untilSaturday = (6 - date.getUTCDay() + 7) % 7
  return { departureDate: addDays(today, untilSaturday) }
}

export function intakeQuestions(draft: IntakeDraft): string[] {
  const questions: string[] = []
  if (draft.international && !draft.departureCity.trim()) questions.push('你从哪座城市出发？')
  if (draft.countryOnly) questions.push(`${draft.destination || '目的地'}准备去哪座城市或地区？`)
  if (!ISO_DATE.test(draft.departureDate)) {
    questions.push('你准备哪天出发？')
  } else if (draft.weekendMentioned && draft.days !== 2) {
    questions.push(`这周末是${cnDateRange(draft.departureDate, addDays(draft.departureDate, 1))}；你想玩2天，还是按当前设置玩${draft.days}天？`)
  }
  if (!draft.companions) questions.push('这次和谁一起去？')
  return questions
}
