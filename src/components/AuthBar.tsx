import { useEffect, useState } from 'react'
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
  const [confirmPw, setConfirmPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'login' | 'request' | 'update'>(() =>
    new URLSearchParams(window.location.search).get('reset') === '1' ? 'update' : 'login',
  )

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('update')
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (session && mode !== 'update') {
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
    if (!email || !pw) {
      setMsg('请填写邮箱和密码')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const { error } =
        kind === 'in'
          ? await supabase.auth.signInWithPassword({ email, password: pw })
          : await supabase.auth.signUp({ email, password: pw })
      if (error) setMsg(error.message)
      else if (kind === 'up') setMsg('注册成功')
    } finally {
      setBusy(false)
    }
  }

  const requestReset = async () => {
    if (!email) {
      setMsg('请先填写注册邮箱')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const redirectTo = `${window.location.origin}/?reset=1`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      setMsg(error ? error.message : '重置邮件已发送，请检查收件箱和垃圾邮件')
    } finally {
      setBusy(false)
    }
  }

  const updatePassword = async () => {
    if (pw.length < 6) {
      setMsg('新密码至少需要 6 位')
      return
    }
    if (pw !== confirmPw) {
      setMsg('两次输入的密码不一致')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) {
        setMsg(error.message)
        return
      }
      window.history.replaceState({}, '', window.location.pathname)
      setPw('')
      setConfirmPw('')
      setMsg('密码已更新，可以继续使用丸丸了')
      setMode('login')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'update') {
    return (
      <div className="mb-7">
        <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-ink-faint)', marginBottom: '12px' }}>
          设置一个新的登录密码
        </div>
        <div className="flex gap-4">
          <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="新密码（至少 6 位）" className="flex-1" style={underline} />
          <input value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} type="password" placeholder="再输入一次" className="flex-1" style={underline} />
        </div>
        <div className="flex gap-5 mt-4 items-center">
          <button
            onClick={updatePassword}
            disabled={busy}
            className="font-serif disabled:opacity-60"
            style={{ background: 'var(--color-qing)', color: 'var(--color-paper-2)', border: 'none', borderRadius: '2px', padding: '7px 20px', fontSize: '13.5px', letterSpacing: '0.08em', cursor: 'pointer' }}
          >
            更新密码
          </button>
          {msg && <span style={{ fontSize: '11.5px', color: 'var(--color-ink-faint)' }}>{msg}</span>}
        </div>
      </div>
    )
  }

  if (mode === 'request') {
    return (
      <div className="mb-7">
        <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-ink-faint)', marginBottom: '12px' }}>
          输入注册邮箱，丸丸会发一封重置邮件
        </div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="注册邮箱" style={{ ...underline, width: '100%' }} />
        <div className="flex gap-5 mt-4 items-center">
          <button
            onClick={requestReset}
            disabled={busy}
            className="font-serif disabled:opacity-60"
            style={{ background: 'var(--color-qing)', color: 'var(--color-paper-2)', border: 'none', borderRadius: '2px', padding: '7px 20px', fontSize: '13.5px', letterSpacing: '0.08em', cursor: 'pointer' }}
          >
            发送重置邮件
          </button>
          <button
            onClick={() => { setMode('login'); setMsg('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-soft)', fontSize: '13px' }}
          >
            返回登录
          </button>
          {msg && <span style={{ fontSize: '11.5px', color: 'var(--color-ink-faint)' }}>{msg}</span>}
        </div>
      </div>
    )
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
        <button
          onClick={() => { setMode('request'); setMsg(''); setPw('') }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-faint)', fontSize: '12px', textDecoration: 'underline', textUnderlineOffset: '3px' }}
        >
          忘记密码
        </button>
        {msg && <span style={{ fontSize: '11.5px', color: 'var(--color-ink-faint)' }}>{msg}</span>}
      </div>
    </div>
  )
}
