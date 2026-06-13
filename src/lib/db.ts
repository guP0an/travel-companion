import { supabase } from './supabase'
import type { Itinerary, ItineraryMeta } from '../types/itinerary'

export interface SavedItinerary {
  id: string
  meta: ItineraryMeta
  plan: Itinerary
  created_at: string
}

// 保存一份行程到云端（RLS 保证只能写自己的）。
export async function saveItinerary(plan: Itinerary): Promise<SavedItinerary> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')
  const { data, error } = await supabase
    .from('itineraries')
    .insert({ user_id: user.id, meta: plan.meta, plan })
    .select('id, meta, plan, created_at')
    .single()
  if (error) throw error
  return data as SavedItinerary
}

// 拉取我的全部行程（跨设备）。
export async function listMyItineraries(): Promise<SavedItinerary[]> {
  const { data, error } = await supabase
    .from('itineraries')
    .select('id, meta, plan, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SavedItinerary[]
}

// ===== 账本 / 消费 =====
export interface Expense {
  id: string
  category: string
  amount: number
  note: string
  spent_at: string | null
  created_at: string
}

export async function listExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, category, amount, note, spent_at, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Expense[]
}

export async function addExpense(e: { category: string; amount: number; note: string; spent_at?: string }): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')
  const { error } = await supabase
    .from('expenses')
    .insert({ user_id: user.id, category: e.category, amount: e.amount, note: e.note, spent_at: e.spent_at || null })
  if (error) throw error
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}

// ===== 景点打卡 =====
export interface Checkin {
  spot: string
  rating: number | null
  review: string
  photos: string[]
  checked_at: string | null
}

export async function getCheckin(spot: string): Promise<Checkin | null> {
  const { data, error } = await supabase
    .from('checkins')
    .select('spot, rating, review, photos, checked_at')
    .eq('spot', spot)
    .maybeSingle()
  if (error) throw error
  return (data as Checkin) || null
}

export async function saveCheckin(c: { spot: string; rating: number | null; review: string; checked: boolean; photos?: string[] }): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')
  const row: Record<string, unknown> = { user_id: user.id, spot: c.spot, rating: c.rating, review: c.review }
  if (c.photos) row.photos = c.photos
  if (c.checked) row.checked_at = new Date().toISOString()
  const { error } = await supabase.from('checkins').upsert(row, { onConflict: 'user_id,spot' })
  if (error) throw error
}
