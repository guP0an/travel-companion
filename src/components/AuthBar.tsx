import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'

const underline: React.CSSProperties = {
  border: 'none',
  borderBottom: '1px solid var(--color-line)',
  background: 'transparent',
  padding: '6px 2px',
  outline: 'none',
  fontSize: '14px',
  color: 'var(--color-ink)',
}

export default function AuthBar() {
  const session = useSession()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) {
    return (
      <div className="flex items-center justify-between mb-6" style={{ fontSize: '12px', color: 'var(--color-ink-faint)' }}>
        <span>已登录 · {session.user.email}</span>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-soft)', textDecoration: 'underline', textUnderlineOffset: '3px' }}
        >
          退出
        </button>
      </div>
    )
  }

  const run = async (kind: 'in' | 'up') => {
    setBusy(true)
    setMsg('')
    const { error } =
      kind === 'in'
        ? await supabase.auth.signInWithPassword({ email, password: pw })
        : await supabase.auth.signUp({ email, password: pw })
    if (error) setMsg(error.message)
    else if (kind === 'up') setMsg('注册成功')
    setBusy(false)
  }

  return (
    <div className="mb-7">
      <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-ink-faint)', marginBottom: '12px' }}>
        登录后行程存到云端 · 跨设备可见
      </div>
      <div className="flex gap-4">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="邮箱" className="flex-1" style={underline} />
        <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="密码" className="flex-1" style={underline} />
      </div>
      <div className="flex gap-5 mt-4 items-center">
        <button
          onClick={() => run('in')}
          disabled={busy}
          className="font-serif disabled:opacity-60"
          style={{ background: 'var(--color-qing)', color: 'var(--color-paper-2)', border: 'none', borderRadius: '2px', padding: '7px 20px', fontSize: '13.5px', letterSpacing: '0.08em', cursor: 'pointer' }}
        >
          登录
        </button>
        <button
          onClick={() => run('up')}
          disabled={busy}
          className="font-serif disabled:opacity-60"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-soft)', fontSize: '13.5px' }}
        >
          注册
        </button>
        {msg && <span style={{ fontSize: '11.5px', color: 'var(--color-ink-faint)' }}>{msg}</span>}
      </div>
    </div>
  )
}
