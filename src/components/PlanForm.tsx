import { useRef, useState } from 'react'
import { tripTiming } from '../../shared/tripTiming'
import { pastedImage } from '../../shared/clipboard'
import type { Itinerary } from '../types/itinerary'
import { generatePlan, revisePlan, extractBookings, extractBookingsFromImage, bookingCategory, parseBookingPrice, type PlanInput, type Booking } from '../lib/plan'
import { addExpense, expenseExists } from '../lib/db'
import { MascotThinking } from './Mascot'

const TYPE_LABEL: Record<string, string> = {
  train: '高铁/火车',
  flight: '机票',
  hotel: '酒店',
  other: '其他',
}


const PACE = [
  { v: 'packed', label: '紧凑' },
  { v: 'balanced', label: '适中' },
  { v: 'leisurely', label: '溜达' },
] as const

export default function PlanForm({
  onResult,
  current,
  hasPlan = false,
  onReset,
}: {
  onResult: (it: Itinerary) => void
  current?: Itinerary
  hasPlan?: boolean
  onReset?: () => void
}) {
  const [destination, setDestination] = useState('')
  const [timingQuestion, setTimingQuestion] = useState('')
  const [timingAnswer, setTimingAnswer] = useState('')
  const [departure, setDeparture] = useState('')
  const [askDeparture, setAskDeparture] = useState(false)
  const [dateUndecided, setDateUndecided] = useState(false)
  const [timingSummary, setTimingSummary] = useState('')
  const [pace, setPace] = useState<PlanInput['pace']>('leisurely')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const readingImage = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [ledgerMsg, setLedgerMsg] = useState('')
  const [openSet, setOpenSet] = useState<Set<number>>(new Set())
  const toggleOpen = (bi: number) =>
    setOpenSet((s) => {
      const n = new Set(s)
      n.has(bi) ? n.delete(bi) : n.add(bi)
      return n
    })

  const compressForVision = async (file: File): Promise<string> => {
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      const maxSide = 1800
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('浏览器无法处理这张图片')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      return canvas.toDataURL('image/jpeg', 0.82)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const readTicketImage = async (f: File) => {
    if (readingImage.current) return
    if (!f.type.startsWith('image/')) { setErr('请选择图片文件'); return }
    if (f.size > 15 * 1024 * 1024) { setErr('图片太大，请控制在 15MB 以内'); return }
    readingImage.current = true
    setOcrBusy(true)
    setErr('')
    try {
      try {
        const image = await compressForVision(f)
        const visualBookings = await extractBookingsFromImage(image)
        if (visualBookings.length > 0) {
          visualBookings.forEach((booking) => { booking.receiptFile = f })
          await autoRecord(visualBookings, f)
          setBookings((prev) => [...prev, ...visualBookings])
          return
        }
      } catch {
        // Kimi 未配置或暂时失败时，继续使用本地 OCR + DeepSeek。
      }
      const Tesseract = (await import('tesseract.js')).default
      const { data } = await Tesseract.recognize(f, 'chi_sim+eng')
      const text = data.text.replace(/\s+/g, ' ').trim()
      if (!text) {
        setErr('没读出文字，换张更清晰的截图试试')
        return
      }
      const bs = await extractBookings(text)
      if (bs.length) {
        bs.forEach((booking) => { booking.receiptFile = f })
        await autoRecord(bs, f) // 带价格的票直接记入账本，并保留票据截图
        setBookings((prev) => [...prev, ...bs]) // 累加，不覆盖之前传的
      } else setOcrText(text)
    } catch (e) {
      setErr('识别失败：' + (e as Error).message)
    } finally {
      readingImage.current = false
      setOcrBusy(false)
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void readTicketImage(file)
  }

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const file = pastedImage(event.clipboardData)
    if (!file) return // Keep normal text paste and unsupported clipboard content untouched.
    event.preventDefault()
    if (readingImage.current) { setErr('正在识别上一张截图，请稍候再粘贴'); return }
    void readTicketImage(file)
  }

  // 识别到带价格的票/酒店，直接记入账本（交通/住宿）。未登录或账本未建表则提示。
  const autoRecord = async (bs: Booking[], receipt?: File) => {
    const done: string[] = []
    for (const b of bs) {
      const amt = parseBookingPrice(b.fields)
      if (!amt) continue
      const category = bookingCategory(b.type)
      try {
        if (await expenseExists({ category, amount: amt, note: b.title })) {
          b.recorded = { amount: amt, category }
          done.push(`${category} ¥${amt}（已存在）`)
          continue
        }
        await addExpense({ category, amount: amt, note: b.title }, receipt ? [receipt] : [])
        b.recorded = { amount: amt, category }
        done.push(`${category} ¥${amt}`)
      } catch (e) {
        const m = (e as Error).message || ''
        if (m.includes('未登录')) setLedgerMsg('登录后，票价会自动记入账本')
        else if (m.includes('receipt_paths') || m.includes('expense-receipts') || m.toLowerCase().includes('bucket')) setLedgerMsg('票据已识别，凭证暂时无法保存')
        else if (m.includes('expenses') || m.includes('schema cache')) setLedgerMsg('账本还没启用：先在 Supabase 跑 expenses 建表 SQL')
        else setLedgerMsg('记账失败：' + m)
        return
      }
    }
    if (done.length) setLedgerMsg('已记入账本：' + done.join('、'))
  }

  const recordBooking = async (booking: Booking, index: number) => {
    const amount = parseBookingPrice(booking.fields)
    if (!amount) {
      setLedgerMsg('先补一下票价，再记入账本')
      return
    }
    const category = bookingCategory(booking.type)
    try {
      if (!(await expenseExists({ category, amount, note: booking.title }))) {
        await addExpense({ category, amount, note: booking.title }, booking.receiptFile ? [booking.receiptFile] : [])
      }
      setBookings((items) => items.map((item, i) => i === index ? { ...item, recorded: { amount, category } } : item))
      setLedgerMsg(`已记入账本：${category} ¥${amount}`)
    } catch (e) {
      const message = (e as Error).message || ''
      if (message.includes('receipt_paths') || message.includes('expense-receipts') || message.toLowerCase().includes('bucket')) setLedgerMsg('票据已识别，凭证暂时无法保存')
      else setLedgerMsg('记账失败：' + message)
    }
  }

  const setField = (bi: number, k: string, v: string) =>
    setBookings((bs) => bs.map((b, i) => (i === bi ? { ...b, fields: { ...b.fields, [k]: v } } : b)))
  const setTitle = (bi: number, v: string) =>
    setBookings((bs) => bs.map((b, i) => (i === bi ? { ...b, title: v } : b)))
  const removeBooking = (bi: number) => setBookings((bs) => bs.filter((_, i) => i !== bi))

  const go = async (openEnded = false) => {
    if (busy) return
    setErr('')
    const ticketText = bookings.length
      ? bookings
          .map((b) => `【${b.title}】` + Object.entries(b.fields).map(([k, v]) => `${k}:${v}`).join('，'))
          .join('；')
      : ocrText || undefined
    // 已有行程 → 这句话当修改指令；否则当新排
    if (hasPlan && current && destination.trim()) {
      setBusy(true)
      setErr('')
      try {
        onResult(await revisePlan(current, destination.trim()))
        setDestination('')
      } catch (e) {
        setErr((e as Error).message)
      } finally {
        setBusy(false)
      }
      return
    }
    if (!destination.trim() && !ticketText) {
      setErr('告诉丸丸去哪儿，或传一张票/酒店截图')
      return
    }
    const timing = tripTiming(destination.trim(), openEnded ? '结束日期未定' : timingAnswer, openEnded)
    if (!timing.days) {
      setTimingQuestion(timing.question || '准备玩几天？')
      setTimingSummary('')
      return
    }
    if (!timing.departureDate && !departure && !dateUndecided) {
      setTimingQuestion(''); setAskDeparture(true); return
    }
    timing.departureDate = departure || timing.departureDate
    setAskDeparture(false)
    setTimingQuestion('')
    setTimingSummary(timing.tentative ? '结束日期未定 · 先安排前 3 天，之后可以继续补充' : `${timing.departureDate ? timing.departureDate + ' 出发 · ' : ''}共 ${timing.days} 天`)
    setBusy(true)
    setErr('')
    try {
      onResult(await generatePlan({ destination: destination.trim(), days: timing.days, pace, ticketText, departureDate: timing.departureDate, travelerNote: timing.tentative ? '用户结束日期未定，本次仅安排前3天作为暂定行程。不要擅自安排返程、退房或声称第3天旅行结束。未明确出发日期时不要编造具体日期。' : timingAnswer }))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="plan-form" onPaste={onPaste}>
      {/* 干净的多行输入（内容自动撑开） */}
      <textarea
        id="planner-input"
        value={destination}
        onChange={(e) => { setDestination(e.target.value); setDeparture(''); setDateUndecided(false); setAskDeparture(false); setTimingAnswer(''); setTimingQuestion(''); setTimingSummary(''); setErr('') }}
        placeholder={hasPlan ? '想改就说：6月20号加个夜市、删掉清水寺、第二天换博物馆…' : '告诉丸丸：去哪 · 几个人 · 想玩什么 · 预算…'}
        rows={1}
        className="font-serif"
        style={{ fieldSizing: 'content', width: '100%', minHeight: '28px', border: 'none', borderBottom: '1px solid var(--color-line)', background: 'transparent', outline: 'none', resize: 'none', color: 'var(--color-ink)', fontSize: '15px', lineHeight: 1.8, padding: '6px 2px', display: 'block' } as React.CSSProperties}
      />

      {timingQuestion && <div className="plan-timing-question" role="group" aria-label="补充行程时间">
        <p className="plan-timing-title" role="status">{timingQuestion}</p>
        <p id="timing-hint" className="plan-timing-hint">填天数或起止日期，没定也可以。</p>
        <input aria-label="结束日期或旅行天数" aria-describedby="timing-hint" value={timingAnswer} onChange={e => { setTimingAnswer(e.target.value); setErr('') }} placeholder="例如：玩 8 天，或 10月2日结束" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void go() } }} />
        <div>
          <button type="button" onClick={() => { void go() }} className="plan-timing-submit" disabled={busy || !timingAnswer.trim()}>开始规划</button>
          <button type="button" onClick={() => { setTimingAnswer('结束日期未定'); void go(true) }} className="plan-timing-skip" disabled={busy}>还没定，先排 3 天</button>
        </div>
      </div>}
      {askDeparture && <div className="plan-timing-question" role="group" aria-label="确认出发日期">
        <p className="plan-timing-title">准备哪天出发？</p>
        <p className="plan-timing-hint">确认日期后，才能查询每天的天气。</p>
        <input type="date" aria-label="出发日期" value={departure} disabled={dateUndecided} onChange={e => setDeparture(e.target.value)} />
        <label><input type="checkbox" checked={dateUndecided} onChange={e => { setDateUndecided(e.target.checked); setDeparture('') }} style={{ width: 'auto', minHeight: 0, marginRight: 8 }} />日期还没定</label>
        <div><button className="plan-timing-submit" disabled={!departure && !dateUndecided} onClick={() => { void go() }}>开始规划</button></div>
      </div>}
      {timingSummary && <p className="plan-timing-summary" role="status">{timingSummary}</p>}

      <div className="plan-pace-row flex gap-5">
        {PACE.map((p) => (
          <button
            key={p.v}
            onClick={() => setPace(p.v)}
            className="font-serif pb-0.5"
            style={{
              fontSize: '14px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: pace === p.v ? 'var(--color-ink)' : 'var(--color-ink-faint)',
              borderBottom: pace === p.v ? '1.5px solid var(--color-qing)' : '1.5px solid transparent',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 上传票务截图，丸丸自己读 */}
      <div className="plan-upload-row">
        <button
          type="button"
          className="plan-upload-button"
          onClick={() => fileInput.current?.click()}
          disabled={ocrBusy}
          aria-describedby="ticket-paste-hint"
        >
          {ocrBusy ? '丸丸正在看截图…' : '＋ 上传票务截图，丸丸自己读（选填）'}
        </button>
        <input ref={fileInput} type="file" accept="image/*" onChange={onFile} disabled={ocrBusy} hidden />
        <div id="ticket-paste-hint" className="plan-paste-hint">也可在这里或描述框粘贴截图 · ⌘V / Ctrl+V</div>
        {bookings.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {bookings.map((b, bi) => {
              const open = openSet.has(bi)
              const f = b.fields
              const depTime = f['出发时间'] || f['发车时间'] || ''
              const date = f['日期'] || f['出发日期'] || ''
              const sub = depTime
                ? `${date} ${depTime} 出发`.trim()
                : f['入住']
                  ? `入住 ${f['入住']}${f['离店'] ? ' · 离店 ' + f['离店'] : ''}`
                  : date || ''
              return (
                <div key={bi} style={{ border: '1px solid var(--color-line)', borderRadius: '10px', padding: '9px 12px' }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: '10px', padding: '1px 8px', borderRadius: '999px', background: 'var(--color-qing-soft)', color: 'var(--color-qing)', flex: '0 0 auto' }}>
                      {TYPE_LABEL[b.type] || '其他'}
                    </span>
                    {open ? (
                      <input
                        value={b.title}
                        onChange={(e) => setTitle(bi, e.target.value)}
                        className="font-serif"
                        style={{ flex: 1, minWidth: 0, border: 'none', borderBottom: '1px solid var(--color-line)', background: 'transparent', fontSize: '14px', outline: 'none', color: 'var(--color-ink)' }}
                      />
                    ) : (
                      <span className="font-serif" style={{ flex: 1, minWidth: 0, fontSize: '14px', color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.title}
                      </span>
                    )}
                    <button onClick={() => toggleOpen(bi)} style={{ background: 'none', border: 'none', color: 'var(--color-qing)', cursor: 'pointer', fontSize: '11.5px', flex: '0 0 auto' }}>
                      {open ? '收起' : '改'}
                    </button>
                    <button onClick={() => removeBooking(bi)} style={{ background: 'none', border: 'none', color: 'var(--color-ink-faint)', cursor: 'pointer', fontSize: '11px', flex: '0 0 auto' }}>
                      删
                    </button>
                  </div>
                  {!open && sub && (
                    <div style={{ fontSize: '12px', color: 'var(--color-qing)', marginTop: '4px', paddingLeft: '2px' }}>{sub}</div>
                  )}
                  {(() => {
                    const amt = parseBookingPrice(f)
                    if (!amt) {
                      return (
                        <div className="booking-ledger-action">
                          <input
                            value={f['价格'] || ''}
                            onChange={(event) => setField(bi, '价格', event.target.value.replace(/[^\d.]/g, ''))}
                            inputMode="decimal"
                            placeholder="补票价 ¥"
                            aria-label={`${b.title}票价`}
                          />
                          <button onClick={() => recordBooking(b, bi)} disabled={!f['价格']}>记入账本</button>
                        </div>
                      )
                    }
                    return (
                      <div className="booking-ledger-status" data-recorded={Boolean(b.recorded)}>
                        <span>¥{amt}{b.recorded ? ` · 已记入账本「${b.recorded.category}」` : ''}</span>
                        {!b.recorded && <button onClick={() => recordBooking(b, bi)}>记入账本</button>}
                      </div>
                    )
                  })()}
                  {open &&
                    Object.entries(b.fields).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 mt-1.5">
                        <span style={{ fontSize: '12px', color: 'var(--color-ink-faint)', width: '60px', flex: '0 0 auto' }}>{k}</span>
                        <input
                          value={v}
                          onChange={(e) => setField(bi, k, e.target.value)}
                          style={{ flex: 1, border: 'none', borderBottom: '1px solid var(--color-line)', background: 'transparent', fontSize: '13px', outline: 'none', color: 'var(--color-ink)' }}
                        />
                      </div>
                    ))}
                </div>
              )
            })}
            <div style={{ fontSize: '11px', color: 'var(--color-ink-faint)' }}>丸丸会把这些票/酒店排进行程；没读到价格可以补金额后记账；读错了点「改」</div>
            {ledgerMsg && <div style={{ fontSize: '11.5px', color: 'var(--color-qing)' }}>{ledgerMsg}</div>}
          </div>
        )}
        {bookings.length === 0 && ocrText && (
          <div className="mt-2" style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--color-ink-soft)', background: 'var(--color-qing-soft)', borderRadius: '8px', padding: '8px 10px' }}>
            读到文字但没认出预订，丸丸会按原文参考。
            <button onClick={() => setOcrText('')} style={{ marginLeft: '8px', background: 'none', border: 'none', color: 'var(--color-ink-faint)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}>
              清除
            </button>
          </div>
        )}
      </div>

      {busy ? (
        <MascotThinking />
      ) : !timingQuestion && !askDeparture && (
        <button
          type="button"
          onClick={() => { void go() }}
          className="plan-primary"
          aria-label={hasPlan ? '更新行程' : '开始规划'}
        >
          <span>{hasPlan ? '更新行程' : '开始规划'}</span>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
        </button>
      )}
      {err && <div className="mt-2" style={{ fontSize: '12px', color: 'var(--color-seal)' }}>{err}</div>}
      {hasPlan && !busy && (
        <div className="mt-3 text-center">
          <button
            onClick={() => {
              onReset?.()
              setDestination('')
              setTimingAnswer(''); setTimingQuestion(''); setTimingSummary('')
              setBookings([])
              setOcrText('')
              setLedgerMsg('')
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-faint)', fontSize: '12px' }}
          >
            ↺ 重新排一版
          </button>
        </div>
      )}
    </div>
  )
}
