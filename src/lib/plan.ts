import type { Itinerary } from '../types/itinerary'
import type { IntakeDraft, IntakeResult, Pace } from '../../shared/planning'
import { supabase } from './supabase'

export interface PlanInput {
  destination: string
  departureCity?: string
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

export interface IntakeInput {
  request: string
  days: number
  pace: Pace
  today: string
  timezone: string
  draft?: IntakeDraft
  answer?: string
  ticketText?: string
}

export interface Booking {
  type: 'train' | 'flight' | 'hotel' | 'other'
  title: string
  fields: Record<string, string>
  receiptFile?: File
}

export interface PendingExpense {
  category: string
  amount: number
  note: string
  receiptFiles: File[]
}

async function aiRequest(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('请先登录后再让丸丸规划～')

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const dataBody = await res.json()
  if (!res.ok || dataBody?.ok === false) throw new Error(dataBody?.friendlyMessage || '丸丸这会儿有点忙，稍后再试试～')
  return dataBody
}

// 票务类型 → 账本分类（对齐 Ledger 的 CATS）
export function bookingCategory(type: Booking['type']): string {
  if (type === 'train' || type === 'flight') return '交通'
  if (type === 'hotel') return '住宿'
  return '其他'
}

// 从 OCR 字段里抠出票价金额；抠不到返回 null（绝不瞎猜车次号当价格）。
export function parseBookingPrice(fields: Record<string, string>): number | null {
  // 1) 优先认价格类字段名
  for (const [k, v] of Object.entries(fields)) {
    if (/价|金额|费用|票价|钱|总额|实付|应付|支付/.test(k)) {
      const m = String(v).match(/(\d+(?:\.\d+)?)/)
      if (m) {
        const n = parseFloat(m[1])
        if (n > 0) return n
      }
    }
  }
  // 2) 兜底：带货币符号/单位的值（¥553、553元、RMB553）
  for (const v of Object.values(fields)) {
    const m = String(v).match(/(?:¥|￥|RMB|rmb)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*元/)
    if (m) {
      const n = parseFloat(m[1] || m[2])
      if (n > 0) return n
    }
  }
  return null
}

export function pendingExpensesFromBookings(bookings: Booking[]): PendingExpense[] {
  return bookings.flatMap((booking) => {
    const amount = parseBookingPrice(booking.fields)
    return amount ? [{
      category: bookingCategory(booking.type),
      amount,
      note: booking.title,
      receiptFiles: booking.receiptFile ? [booking.receiptFile] : [],
    }] : []
  })
}

// 上传截图 OCR 出的文字 → 代理 → DeepSeek 结构化提取出预订信息（可编辑）。
export async function extractBookings(text: string): Promise<Booking[]> {
  const data = await aiRequest({ op: 'extract', text })
  return (data.bookings || []) as Booking[]
}

export async function extractBookingsFromImage(image: string): Promise<Booking[]> {
  const data = await aiRequest({ op: 'vision', image })
  return (data.bookings || []) as Booking[]
}

export async function intakePlan(input: IntakeInput): Promise<IntakeResult> {
  return await aiRequest({ op: 'intake', ...input }) as IntakeResult
}

// 用一句话让丸丸修改已有行程。
export async function revisePlan(plan: Itinerary, instruction: string): Promise<Itinerary> {
  const data = await aiRequest({ op: 'revise', plan, instruction })
  return data as Itinerary
}

// 调本地代理 → DeepSeek，返回丸丸现排的行程 JSON。
export async function generatePlan(input: PlanInput): Promise<Itinerary> {
  const data = await aiRequest({ op: 'plan', ...input })
  return data as Itinerary
}
