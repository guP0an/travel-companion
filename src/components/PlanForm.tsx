import { useState } from 'react'
import type { Itinerary } from '../types/itinerary'
import { generatePlan, extractBookings, type PlanInput, type Booking } from '../lib/plan'
import { MascotThinking } from './Mascot'

const TYPE_LABEL: Record<string, string> = {
  train: '高铁/火车',
  flight: '机票',
  hotel: '酒店',
  other: '其他',
}

// 一串丸子：每颗丸子一个字、一种颜色
const DANGO: [string, string][] = [
  ['让', '#3E9E9E'],
  ['丸', '#E68A3C'],
  ['丸', '#DB6A86'],
  ['排', '#7FA85C'],
  ['一', '#E0B23C'],
  ['版', '#8E7BC4'],
]

const PACE = [
  { v: 'packed', label: '紧凑' },
  { v: 'balanced', label: '适中' },
  { v: 'leisurely', label: '溜达' },
] as const

const underline: React.CSSProperties = {
  border: 'none',
  borderBottom: '1px solid var(--color-line)',
  background: 'transparent',
  padding: '6px 2px',
  outline: 'none',
  fontSize: '15px',
  color: 'var(--color-ink)',
}

export default function PlanForm({ onResult }: { onResult: (it: Itinerary) => void }) {
  const [destination, setDestination] = useState('')
  const [days, setDays] = useState(3)
  const [pace, setPace] = useState<PlanInput['pace']>('leisurely')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
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
    setBookings([])
    setOcrText('')
    try {
      const Tesseract = (await import('tesseract.js')).default
      const { data } = await Tesseract.recognize(f, 'chi_sim+eng')
      const text = data.text.replace(/\s+/g, ' ').trim()
      setOcrText(text)
      if (!text) {
        setErr('没读出文字，换张更清晰的截图试试')
        return
      }
      setBookings(await extractBookings(text))
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
    if (!destination.trim() && !ticketText) {
      setErr('告诉丸丸去哪儿，或传一张票/酒店截图')
      return
    }
    setBusy(true)
    setErr('')
    try {
      onResult(await generatePlan({ destination: destination.trim(), days, pace, ticketText }))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-9">
      <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-ink-faint)', marginBottom: '14px' }}>
        告诉丸丸去哪、几天、预算、几个人，丸丸给你安排行程
      </div>
      <div className="flex gap-4 items-end">
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="目的地，如 成都"
          className="font-serif flex-1"
          style={underline}
        />
        <input
          type="number"
          min={1}
          max={15}
          value={days}
          onChange={(e) => setDays(Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
          className="font-serif"
          style={{ ...underline, width: '44px', textAlign: 'center' }}
        />
        <span style={{ fontSize: '13px', color: 'var(--color-ink-faint)', paddingBottom: '7px' }}>天</span>
      </div>
      <div className="flex gap-5 mt-5">
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
      <div className="mt-5">
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
          {ocrBusy ? '丸丸正在读截图…' : '＋ 上传票务截图，丸丸自己读（选填）'}
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
            <div style={{ fontSize: '11px', color: 'var(--color-ink-faint)' }}>丸丸会把这些票/酒店排进行程；读错了点「改」</div>
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
          className="w-full mt-7"
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          aria-label="让丸丸排一版"
        >
          <svg viewBox="0 0 290 58" width="100%" style={{ display: 'block' }}>
            <defs>
              <radialGradient id="dgloss" cx="36%" cy="26%" r="75%">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
                <stop offset="60%" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="dshade" cx="50%" cy="104%" r="80%">
                <stop offset="0%" stopColor="#000" stopOpacity="0.2" />
                <stop offset="55%" stopColor="#000" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* 竹签 */}
            <line x1="6" y1="29" x2="284" y2="29" stroke="#C9A06A" strokeWidth="4" strokeLinecap="round" />
            {DANGO.map(([c, col], i) => {
              const cx = 33 + i * 44
              return (
                <g key={i}>
                  <circle cx={cx} cy="29" r="22" fill={col} />
                  <circle cx={cx} cy="29" r="22" fill="url(#dshade)" />
                  <circle cx={cx} cy="29" r="22" fill="url(#dgloss)" />
                  <text x={cx} y="36" textAnchor="middle" fontSize="20" fontWeight="500" fill="#fff" className="font-serif">
                    {c}
                  </text>
                </g>
              )
            })}
          </svg>
        </button>
      )}
      {err && <div className="mt-2" style={{ fontSize: '12px', color: 'var(--color-seal)' }}>{err}</div>}
    </div>
  )
}
