import { post, request } from './api'
import type { Itinerary, ItineraryMeta } from '../types/itinerary'

export interface SavedItinerary {
  id: string
  meta: ItineraryMeta
  plan: Itinerary
  created_at: string
}

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

export interface Checkin {
  spot: string
  rating: number | null
  review: string
  photos: string[]
  checked_at: string | null
}


export const saveItinerary = (plan: Itinerary) => post<SavedItinerary>('/api/itineraries', { plan })
export const listMyItineraries = () => request<SavedItinerary[]>('/api/itineraries')
export const listExpenses = () => request<Expense[]>('/api/expenses')
export const deleteExpense = (id: string) => request<void>(`/api/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' })
export async function expenseExists(e: { category: string; amount: number; note: string }, withinMinutes = 10) {
  const since = Date.now() - withinMinutes * 60_000
  return (await listExpenses()).some(row => row.category === e.category && row.amount === e.amount && row.note === e.note && Date.parse(row.created_at) >= since)
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

async function upload(files: File[], kind: 'receipt' | 'checkin'): Promise<string[]> {
  if (files.length > (kind === 'receipt' ? 3 : 12)) throw new Error('照片数量超过限制')
  const urls: string[] = []
  for (const source of files) {
    const file = await prepareReceipt(source)
    if (file.size > 2_000_000) throw new Error('图片压缩后仍超过 2MB，请选择更小的图片')
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('图片读取失败'))
      reader.readAsDataURL(file)
    })
    const result = await post<{ url: string }>('/api/photos', { kind, image })
    urls.push(result.url)
  }
  return urls
}
export async function addExpense(e: { category: string; amount: number; note: string; spent_at?: string }, receiptFiles: File[] = []): Promise<void> {
  const receipt_paths = await upload(receiptFiles, 'receipt')
  await post('/api/expenses', { ...e, receipt_paths })
}
export const uploadPhotos = (files: File[]) => upload(files, 'checkin')
export async function countCheckins(): Promise<number> {
  return (await request<Checkin[]>('/api/checkins')).filter(row => row.checked_at).length
}
export async function getCheckin(spot: string): Promise<Checkin | null> {
  return (await request<Checkin[]>('/api/checkins')).find(row => row.spot === spot) || null
}
export async function saveCheckin(c: { spot: string; rating: number | null; review: string; checked: boolean; photos?: string[] }): Promise<void> {
  await post('/api/checkins', c)
}
