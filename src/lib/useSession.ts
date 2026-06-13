import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

// 跟踪当前登录会话；登录态变化自动刷新。
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession(s),
    )
    return () => sub.subscription.unsubscribe()
  }, [])
  return session
}
