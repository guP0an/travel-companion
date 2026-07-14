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
  receipt_paths: string[]
  receipt_urls: string[]
}

export async function listExpenses(): Promise<Expense[]> {
  let { data, error } = await supabase
    .from('expenses')
    .select('id, category, amount, note, spent_at, created_at, receipt_paths')
    .order('created_at', { ascending: false })
  if (error && (error.message.includes('receipt_paths') || error.message.includes('schema cache'))) {
    const fallback = await supabase
      .from('expenses')
      .select('id, category, amount, note, spent_at, created_at')
      .order('created_at', { ascending: false })
    data = fallback.data as typeof data
    error = fallback.error
  }
  if (error) throw error
  const rows = (data ?? []) as Array<Omit<Expense, 'receipt_urls'> & { receipt_paths?: string[] }>
  const paths = [...new Set(rows.flatMap((row) => row.receipt_paths || []))]
  const signedByPath = new Map<string, string>()
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from('expense-receipts').createSignedUrls(paths, 60 * 60)
    signed?.forEach((item) => {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl)
    })
  }
  return rows.map((row) => ({
    ...row,
    receipt_paths: row.receipt_paths || [],
    receipt_urls: (row.receipt_paths || []).map((path) => signedByPath.get(path)).filter(Boolean) as string[],
  }))
}

const prepareReceipt = async (file: File): Promise<File> => {
  if (!file.type.startsWith('image/')) throw new Error('凭证只能上传图片')
  if (file.size > 15 * 1024 * 1024) throw new Error('单张凭证请控制在 15MB 以内')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const maxSide = 1800
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法处理这张凭证')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('凭证压缩失败')), 'image/jpeg', 0.84)
    })
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'receipt'}.jpg`, { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function uploadExpenseReceipts(files: File[], userId: string): Promise<string[]> {
  const paths: string[] = []
  for (const [index, source] of files.slice(0, 3).entries()) {
    const file = await prepareReceipt(source)
    const path = `${userId}/${Date.now()}-${index}-${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from('expense-receipts').upload(path, file, { contentType: 'image/jpeg' })
    if (error) {
      if (paths.length) await supabase.storage.from('expense-receipts').remove(paths)
      throw error
    }
    paths.push(path)
  }
  return paths
}

export async function addExpense(
  e: { category: string; amount: number; note: string; spent_at?: string },
  receiptFiles: File[] = [],
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')
  const receiptPaths = receiptFiles.length ? await uploadExpenseReceipts(receiptFiles, user.id) : []
  const row: Record<string, unknown> = {
    user_id: user.id,
    category: e.category,
    amount: e.amount,
    note: e.note,
    spent_at: e.spent_at || null,
  }
  if (receiptPaths.length) row.receipt_paths = receiptPaths
  const { error } = await supabase
    .from('expenses')
    .insert(row)
  if (error) {
    if (receiptPaths.length) await supabase.storage.from('expense-receipts').remove(receiptPaths)
    throw error
  }
}

export async function expenseExists(e: { category: string; amount: number; note: string }, withinMinutes = 10): Promise<boolean> {
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString()
  const { data, error } = await supabase
    .from('expenses')
    .select('id')
    .eq('category', e.category)
    .eq('amount', e.amount)
    .eq('note', e.note)
    .gte('created_at', since)
    .limit(1)
  if (error) throw error
  return Boolean(data?.length)
}

export async function deleteExpense(id: string): Promise<void> {
  const { data } = await supabase.from('expenses').select('receipt_paths').eq('id', id).maybeSingle()
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
  const paths = Array.isArray(data?.receipt_paths) ? data.receipt_paths : []
  if (paths.length) await supabase.storage.from('expense-receipts').remove(paths)
}

// ===== 景点打卡 =====
export interface Checkin {
  spot: string
  rating: number | null
  review: string
  photos: string[]
  checked_at: string | null
}

// 把打卡照片上传到 Supabase Storage 的 checkin-photos 桶，返回公开 URL。
export async function uploadPhotos(files: File[]): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')
  const urls: string[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${user.id}/${Date.now()}-${i}.${ext}`
    const { error } = await supabase.storage.from('checkin-photos').upload(path, f, { upsert: false, contentType: f.type || undefined })
    if (error) throw error
    urls.push(supabase.storage.from('checkin-photos').getPublicUrl(path).data.publicUrl)
  }
  return urls
}

export async function countCheckins(): Promise<number> {
  const { count, error } = await supabase.from('checkins').select('id', { count: 'exact', head: true }).not('checked_at', 'is', null)
  if (error) return 0
  return count || 0
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
