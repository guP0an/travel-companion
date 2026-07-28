import { useState } from 'react'
import type { Itinerary } from '../types/itinerary'
import { compressForVision, generatePlan, revisePlan, intakePlan, extractBookings, extractBookingsFromImage, parseBookingPrice, pendingExpensesFromBookings, type PlanInput, type Booking, type PendingExpense } from '../lib/plan'
import type { IntakeDraft } from '../../shared/planning'
import { MascotThinking } from './Mascot'

const TYPE_LABEL: Record<string, string> = {
  train: '高铁/火车',
  flight: '机票',
  hotel: '酒店',
  other: '其他',
}

const DANGO = ['#3E9E9E', '#E68A3C', '#DB6A86', '#7FA85C', '#E0B23C', '#8E7BC4']

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
  onResult: (it: Itinerary, pendingExpenses?: PendingExpense[]) => void
  current?: Itinerary
  hasPlan?: boolean
  onReset?: () => void
}) {
  const [destination, setDestination] = useState('')
  const days = 3
  const [pace, setPace] = useState<PlanInput['pace']>('leisurely')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [intakeDraft, setIntakeDraft] = useState<IntakeDraft>()
  const [originalRequest, setOriginalRequest] = useState('')
  const [questions, setQuestions] = useState<string[]>([])
  const [openSet, setOpenSet] = useState<Set<number>>(new Set())
  const toggleOpen = (bi: number) =>
    setOpenSet((s) => {
      const n = new Set(s)
      n.has(bi) ? n.delete(bi) : n.add(bi)
      return n
    })

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setOcrBusy(true)
    setErr('')
    try {
      try {
        const image = await compressForVision(f)
        const visualBookings = await extractBookingsFromImage(image)
        if (visualBookings.length > 0) {
          visualBookings.forEach((booking) => { booking.receiptFile = f })
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
        setBookings((prev) => [...prev, ...bs]) // 累加，不覆盖之前传的
      } else setOcrText(text)
    } catch (e) {
      setErr('识别失败：' + (e as Error).message)
    } finally {
      setOcrBusy(false)
    }
  }

  const setField = (bi: number, k: string, v: string) =>
    setBookings((bs) => bs.map((b, i) => (i === bi ? { ...b, fields: { ...b.fields, [k]: v } } : b)))
  const setTitle = (bi: number, v: string) =>
    setBookings((bs) => bs.map((b, i) => (i === bi ? { ...b, title: v } : b)))
  const removeBooking = (bi: number) => setBookings((bs) => bs.filter((_, i) => i !== bi))

  const go = async () => {
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
    const answer = destination.trim()
    if (!answer && !ticketText) {
      setErr('告诉丸丸去哪儿，或传一张票/酒店截图')
      return
    }
    setBusy(true)
    setErr('')
    try {
      if (!answer && ticketText) {
        onResult(await generatePlan({ destination: '', days, pace, ticketText }), pendingExpensesFromBookings(bookings))
        return
      }
      const request = intakeDraft ? originalRequest : answer
      const now = new Date()
      const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-')
      const intake = await intakePlan({
        request,
        days,
        pace: pace || 'leisurely',
        today,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
        draft: intakeDraft,
        answer: intakeDraft ? answer : undefined,
        ticketText,
      })
      if (intake.status === 'needs_input') {
        setOriginalRequest(request)
        setIntakeDraft(intake.draft)
        setQuestions(intake.questions)
        setDestination('')
        return
      }
      onResult(await generatePlan({ ...intake.input, ticketText }), pendingExpensesFromBookings(bookings))
      setIntakeDraft(undefined)
      setOriginalRequest('')
      setQuestions([])
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="plan-form">
      {questions.length > 0 && (
        <section className="planner-questions" aria-live="polite">
          <div className="planner-questions-label">丸丸还需要确认</div>
          <ol>
            {questions.map((question) => <li key={question}>{question}</li>)}
          </ol>
          <p>可以一次把答案都告诉我，例如：上海出发、东京、2天、和伴侣。</p>
        </section>
      )}
      {/* 干净的多行输入（内容自动撑开） */}
      <textarea
        id="planner-input"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        placeholder={hasPlan ? '想改就说：6月20号加个夜市、删掉清水寺、第二天换博物馆…' : questions.length ? '把上面几个问题一次告诉丸丸…' : '告诉丸丸：去哪 · 几个人 · 想玩什么 · 预算…'}
        rows={1}
        className="font-serif"
        style={{ fieldSizing: 'content', width: '100%', minHeight: '28px', border: 'none', borderBottom: '1px solid var(--color-line)', background: 'transparent', outline: 'none', resize: 'none', color: 'var(--color-ink)', fontSize: '15px', lineHeight: 1.8, padding: '6px 2px', display: 'block' } as React.CSSProperties}
      />

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
        <label
          style={{
            display: 'inline-block',
            fontSize: '13px',
            color: 'var(--color-qing)',
            cursor: 'pointer',
            borderBottom: '1px dashed var(--color-qing)',
            paddingBottom: '1px',
          }}
        >
          {ocrBusy ? '丸丸正在看截图…' : '＋ 上传票务截图，丸丸自己读（选填）'}
          <input type="file" accept="image/*" onChange={onFile} disabled={ocrBusy} style={{ display: 'none' }} />
        </label>
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
                          <span>生成行程后归入本次账本</span>
                        </div>
                      )
                    }
                    return (
                      <div className="booking-ledger-status">
                        <span>¥{amt} · 将归入本次行程账本</span>
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
            <div style={{ fontSize: '11px', color: 'var(--color-ink-faint)' }}>丸丸会把这些票/酒店排进行程；金额会在行程保存时归入这趟账本；读错了点「改」</div>
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
      ) : (
        <button
          onClick={go}
          className="plan-primary font-serif"
          aria-label="让丸丸排一版"
        >
          <span className="plan-primary-mark" aria-hidden>
            {DANGO.map((color) => <span key={color} style={{ background: color }} />)}
          </span>
          <span>{hasPlan ? '请丸丸调整行程' : questions.length ? '回答丸丸' : '让丸丸排一版'}</span>
          <span aria-hidden>→</span>
        </button>
      )}
      {err && <div className="mt-2" style={{ fontSize: '12px', color: 'var(--color-seal)' }}>{err}</div>}
      {hasPlan && !busy && (
        <div className="mt-3 text-center">
          <button
            onClick={() => {
              onReset?.()
              setDestination('')
              setBookings([])
              setOcrText('')
              setIntakeDraft(undefined)
              setOriginalRequest('')
              setQuestions([])
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
