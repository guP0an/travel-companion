import { useEffect, useSyncExternalStore } from 'react'
import { invalidateRequests, post, request } from './api'
export type Session = { user: { id: string; username: string } }
let session: Session | null = null
let version = 0
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
function setSession(user: Session['user'] | null) {
  version++
  if (session?.user.id === user?.id) return
  invalidateRequests()
  session = user ? { user } : null
  listeners.forEach(listener => listener())
}
window.addEventListener('wanwan-session-expired', () => setSession(null))
export async function refreshSession() {
  const requested = version
  try {
    const data = await request<{ user: Session['user'] | null }>('/api/auth/session')
    if (requested === version) setSession(data.user)
  } catch { /* A transient network failure does not discard a known session. */ }
}
export async function authenticate(mode: 'login' | 'register' | 'recover', value: { username: string; password: string; recoveryCode?: string }) {
  const data = await post<{ user: Session['user'] | null; recoveryCode?: string }>(`/api/auth/${mode}`, value)
  setSession(data.user)
  return data
}
export async function logout() {
  await post('/api/auth/logout', {})
  setSession(null)
}
export function useSession() {
  const value = useSyncExternalStore(subscribe, () => session, () => null)
  useEffect(() => {
    void refreshSession()
    const onFocus = () => { void refreshSession() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  return value
}
