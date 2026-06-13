import { useState } from 'react'
import type { Itinerary, Item, Period } from '../types/itinerary'
import SpotDetail from './SpotDetail'

const PERIOD: Record<Period, string> = { morning: '上午', afternoon: '下午', evening: '晚上' }
const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五']
const HAS_MAP: Item['type'][] = ['sight', 'food', 'activity']

function blankItem(): Item {
  return { type: 'activity', name: '新安排', area: '', why: '', butlerTip: '', timeHint: '', durationHint: '', costHint: '', imageQuery: '', confidence: 'medium' }
}

const edInput: React.CSSProperties = {
  border: 'none',
  borderBottom: '1px solid var(--color-line)',
  background: 'transparent',
  outline: 'none',
  color: 'var(--color-ink)',
  padding: '2px 0',
}

function ItemRow({
  item,
  city,
  editing,
  onPatch,
  onRemove,
  onMark,
}: {
  item: Item
  city: string
  editing: boolean
  onPatch: (p: Partial<Item>) => void
  onRemove: () => void
  onMark: () => void
}) {
  if (editing) {
    return (
      <div className="py-3" style={{ borderTop: '1px solid var(--color-line)' }}>
        <div className="flex items-center gap-2">
          <input value={item.timeHint} onChange={(e) => onPatch({ timeHint: e.target.value })} placeholder="时间" className="font-serif" style={{ ...edInput, width: '58px', flex: '0 0 auto', fontSize: '13px', color: 'var(--color-qing)' }} />
          <input value={item.name} onChange={(e) => onPatch({ name: e.target.value })} className="font-serif" style={{ ...edInput, flex: 1, minWidth: 0, fontSize: '15px' }} />
          <button onClick={onRemove} aria-label="删除" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-faint)', fontSize: '16px', lineHeight: 1 }}>×</button>
        </div>
        <input value={item.why} onChange={(e) => onPatch({ why: e.target.value })} placeholder="一句推荐理由" style={{ ...edInput, width: '100%', fontSize: '13px', marginTop: '6px', color: 'var(--color-ink-soft)' }} />
        <div className="flex gap-3 mt-1.5">
          <input value={item.costHint} onChange={(e) => onPatch({ costHint: e.target.value })} placeholder="花费" style={{ ...edInput, width: '90px', fontSize: '12.5px' }} />
          <input value={item.butlerTip} onChange={(e) => onPatch({ butlerTip: e.target.value })} placeholder="丸丸提醒（选填）" style={{ ...edInput, flex: 1, fontSize: '12.5px' }} />
        </div>
      </div>
    )
  }

  const mapUrl = `https://uri.amap.com/search?keyword=${encodeURIComponent((city ? city + ' ' : '') + item.name)}`
  return (
    <div className="py-4" style={{ borderTop: '1px solid var(--color-line)' }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        {item.timeHint && (
          <span className="font-serif" style={{ fontSize: '13px', color: 'var(--color-qing)', flex: '0 0 auto' }}>{item.timeHint}</span>
        )}
        <span className="font-serif" style={{ fontSize: '16px', color: 'var(--color-ink)' }}>{item.name}</span>
        {item.area && <span style={{ fontSize: '12px', color: 'var(--color-ink-faint)' }}>{item.area}</span>}
        {HAS_MAP.includes(item.type) && (
          <a href={mapUrl} target="_blank" rel="noreferrer" aria-label="在地图中查看" title="在地图中查看" style={{ display: 'inline-flex', alignSelf: 'center', lineHeight: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-qing)" aria-hidden>
              <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
            </svg>
          </a>
        )}
        {HAS_MAP.includes(item.type) && (
          <button onClick={onMark} aria-label="打卡 / 详情" title="打卡 / 详情" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignSelf: 'center', lineHeight: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-seal)" aria-hidden>
              <path d="M6 2v20M6 3h11l-2 4 2 4H6" stroke="var(--color-seal)" strokeWidth="2" fill="var(--color-seal)" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      <div className="mt-1" style={{ fontSize: '13px', lineHeight: 1.85, color: 'var(--color-ink-soft)' }}>
        {item.why}
        {item.costHint && <span style={{ color: 'var(--color-ink-faint)' }}>　{item.costHint}</span>}
      </div>
      {item.butlerTip && (
        <div className="mt-2 pl-3" style={{ borderLeft: '1.5px solid var(--color-qing)', fontSize: '12.5px', lineHeight: 1.85, color: 'var(--color-ink-soft)' }}>
          <span style={{ color: 'var(--color-qing)' }}>丸丸 ·</span> {item.butlerTip}
        </div>
      )}
    </div>
  )
}

export default function ResultView({
  data,
  editing = false,
  onChange,
  onCheckin,
}: {
  data: Itinerary
  editing?: boolean
  onChange?: (it: Itinerary) => void
  onCheckin?: () => void
}) {
  const city = data.meta.destination
  const [markSpot, setMarkSpot] = useState<string | null>(null)

  const mutDays = (d: number, fn: (day: Itinerary['days'][number]) => Itinerary['days'][number]) =>
    onChange?.({ ...data, days: data.days.map((day, x) => (x === d ? fn(day) : day)) })
  const patchItem = (d: number, s: number, i: number, p: Partial<Item>) =>
    mutDays(d, (day) => ({ ...day, segments: day.segments.map((seg, y) => (y === s ? { ...seg, items: seg.items.map((it, z) => (z === i ? { ...it, ...p } : it)) } : seg)) }))
  const removeItem = (d: number, s: number, i: number) =>
    mutDays(d, (day) => ({ ...day, segments: day.segments.map((seg, y) => (y === s ? { ...seg, items: seg.items.filter((_, z) => z !== i) } : seg)) }))
  const addItem = (d: number, s: number) =>
    mutDays(d, (day) => ({ ...day, segments: day.segments.map((seg, y) => (y === s ? { ...seg, items: [...seg.items, blankItem()] } : seg)) }))
  const setTheme = (d: number, v: string) => mutDays(d, (day) => ({ ...day, theme: v }))

  return (
    <div>
      <blockquote className="my-8 pl-5 font-serif" style={{ borderLeft: '2px solid var(--color-qing)', fontSize: '17px', lineHeight: 2, color: 'var(--color-ink)', margin: '2rem 0' }}>
        {data.greeting}
      </blockquote>

      {data.days.map((day, d) => (
        <section key={d} className="mb-10">
          <div className="flex items-baseline gap-3 pb-2.5 mb-1" style={{ borderBottom: '1px solid var(--color-line)' }}>
            <span style={{ fontSize: '10.5px', letterSpacing: '0.22em', color: 'var(--color-ink-faint)' }}>DAY</span>
            <span className="font-serif" style={{ fontSize: '28px', lineHeight: 1, color: 'var(--color-ink)' }}>{CN[day.dayIndex] || day.dayIndex}</span>
            {day.date && <span style={{ fontSize: '11.5px', color: 'var(--color-ink-faint)' }}>{day.date}</span>}
            {editing ? (
              <input value={day.theme} onChange={(e) => setTheme(d, e.target.value)} className="font-serif ml-auto" style={{ ...edInput, fontSize: '15px', color: 'var(--color-ink-soft)', textAlign: 'right', width: '150px' }} />
            ) : (
              <span className="font-serif ml-auto" style={{ fontSize: '15px', color: 'var(--color-ink-soft)' }}>{day.theme}</span>
            )}
          </div>
          {day.segments.map((seg, s) => (
            <div key={s}>
              <div className="mt-5 mb-0.5" style={{ fontSize: '11px', letterSpacing: '0.22em', color: 'var(--color-qing)' }}>{PERIOD[seg.period]}</div>
              {seg.items.map((it, i) => (
                <ItemRow key={i} item={it} city={city} editing={editing} onPatch={(p) => patchItem(d, s, i, p)} onRemove={() => removeItem(d, s, i)} onMark={() => setMarkSpot(it.name)} />
              ))}
              {editing && (
                <button onClick={() => addItem(d, s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-qing)', fontSize: '12.5px', marginTop: '6px' }}>＋ 加一项</button>
              )}
            </div>
          ))}
        </section>
      ))}

      <div className="font-serif" style={{ fontSize: '15px', lineHeight: 1.95, color: 'var(--color-ink-soft)' }}>{data.closing}</div>
      <div className="mt-6" style={{ fontSize: '11px', lineHeight: 1.7, color: 'var(--color-ink-faint)' }}>{data.disclaimer}</div>

      {markSpot && <SpotDetail name={markSpot} city={city} onClose={() => setMarkSpot(null)} onSaved={onCheckin} />}
    </div>
  )
}
