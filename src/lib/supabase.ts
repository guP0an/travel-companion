import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// 缺变量时用占位值兜底：保证前端不会因 createClient 抛错而整页白屏；
// 登录/云端功能会在调用时优雅失败（已有 try/catch 提示），界面照常可用。
export const supabaseReady = Boolean(url && anon)
if (!supabaseReady) {
  console.warn('[丸丸] Supabase 环境变量缺失：VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY（登录/云端暂不可用）')
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anon || 'placeholder-anon-key')

export async function isPhoneAuthEnabled(): Promise<boolean> {
  if (!supabaseReady) return false
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: anon },
    })
    if (!response.ok) return false
    const settings = await response.json() as { external?: { phone?: boolean } }
    return settings.external?.phone === true
  } catch {
    return false
  }
}
