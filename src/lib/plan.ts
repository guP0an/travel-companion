import type { Itinerary } from '../types/itinerary'

export interface PlanInput {
  destination: string
  days: number
  pace?: 'packed' | 'balanced' | 'leisurely'
  companions?: 'solo' | 'couple' | 'friends' | 'family' | 'other'
  mustVisit?: string[]
  avoid?: string
  budgetTier?: 'budget' | 'moderate' | 'comfort' | 'custom'
  budgetNote?: string
  travelerTags?: string[]
  travelerNote?: string
  departureDate?: string
  ticketText?: string // 上传票务截图 OCR 出的文字
}

export interface Booking {
  type: 'train' | 'flight' | 'hotel' | 'other'
  title: string
  fields: Record<string, string>
}

// 上传截图 OCR 出的文字 → 代理 → DeepSeek 结构化提取出预订信息（可编辑）。
export async function extractBookings(text: string): Promise<Booking[]> {
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const data = await res.json()
  if (data && data.ok === false) throw new Error(data.friendlyMessage || '解析失败')
  return (data.bookings || []) as Booking[]
}

// 用一句话让丸丸修改已有行程。
export async function revisePlan(plan: Itinerary, instruction: string): Promise<Itinerary> {
  const res = await fetch('/api/revise', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan, instruction }),
  })
  const data = await res.json()
  if (data && data.ok === false) throw new Error(data.friendlyMessage || '改不动')
  return data as Itinerary
}

// 调本地代理 → DeepSeek，返回丸丸现排的行程 JSON。
export async function generatePlan(input: PlanInput): Promise<Itinerary> {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (data && data.ok === false) {
    throw new Error(data.friendlyMessage || '生成失败')
  }
  return data as Itinerary
}
