import { useEffect, useState } from 'react'
import type { Itinerary, Item, Period, PrepNote, Highlight, WeatherAlertNotice } from '../types/itinerary'
import SpotDetail from './SpotDetail'
import WeatherScene from './WeatherScene'
import { forecastableDates, itineraryWeatherCity } from '../../shared/weather'
import { fetchWeather, type DayWeather } from '../lib/weather'
import { phenomena, type Phenomenon } from '../lib/phenomena'

const PERIOD: Record<Period, string> = { morning: '上午', afternoon: '下午', evening: '晚上' }
const PREP_ICON: Record<PrepNote['category'], string> = {
  货币: '💱', 插头电压: '🔌', 网络流量: '📶', 证件签注: '🪪', 支付: '💳', 语言: '🗣️', 天气穿衣: '🌤️', 交通: '🚇', 健康安全: '🩹', 风俗: '🎎', 其他: '📌',
}

function WeatherAlertBand({ alerts }: { alerts: WeatherAlertNotice[] }) {
  const urgent = alerts.some((alert) => ['red', 'orange'].includes(alert.color.toLowerCase()) || ['severe', 'extreme'].includes(alert.severity.toLowerCase()))
  return (
    <section className={`weather-alert-band${urgent ? ' urgent' : ''}`} aria-label="当前天气预警">
      <div className="weather-alert-heading">
        <span aria-hidden>!</span>
        当前生效天气预警
      </div>
      <div className="weather-alert-list">
        {alerts.map((alert, index) => (
          <div key={alert.id || index}>
            <div className="weather-alert-title">{[alert.color, alert.event].filter(Boolean).join(' ')}预警 · {alert.headline}</div>
            {alert.instruction && <div className="weather-alert-detail">{alert.instruction}</div>}
            <div className="weather-alert-source">
              {alert.sender || '官方气象机构'}{alert.expiresAt ? ` · 有效至 ${alert.expiresAt}` : ''} ·{' '}
              <a href="https://developer.qweather.com/attribution.html" target="_blank" rel="noreferrer">和风天气</a>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function PrepCard({ notes }: { notes: PrepNote[] }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="mb-8" style={{ border: '1px solid var(--color-line)', borderRadius: '6px', background: 'var(--color-paper-2)', padding: '14px 16px' }}>
      <button onClick={() => setOpen((v) => !v)} className="font-serif" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0, color: 'var(--color-ink)', fontSize: '15px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', background: 'var(--color-seal)', color: '#F7F3EA', borderRadius: '3px', fontSize: '10px' }}>嘱</span>
          行前准备 · 注意事项
        </span>
        <span style={{ color: 'var(--color-ink-faint)', fontSize: '13px' }}>{open ? '收起' : `展开 ${notes.length} 条`}</span>
      </button>
      {open && (
        <div className="mt-3" style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
          {notes.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: '9px' }}>
              <span aria-hidden style={{ fontSize: '15px', lineHeight: 1.5, flex: '0 0 auto' }}>{PREP_ICON[n.category] || '📌'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'var(--color-ink)' }}>
                  <span className="font-serif" style={{ color: 'var(--color-qing)', marginRight: '6px' }}>{n.category}</span>
                  {n.title}
                </div>
                {n.detail && <div style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--color-ink-soft)', marginTop: '2px' }}>{n.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
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

const CHANCE_LABEL: Record<Phenomenon['chance'], { t: string; c: string } | null> = {
  high: { t: '概率较高', c: 'var(--color-seal)' },
  medium: { t: '有机会', c: 'var(--color-qing)' },
  low: { t: '概率较低', c: 'var(--color-ink-faint)' },
  info: null,
}
// 当季限定（模型给的本地当季著名景观/时令）——整趟一张卡，放在行前准备之后
function HighlightCard({ list }: { list: Highlight[] }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="mb-8" style={{ border: '1px solid var(--color-seal)', borderRadius: '6px', background: 'var(--color-paper-2)', padding: '14px 16px' }}>
      <button onClick={() => setOpen((v) => !v)} className="font-serif" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0, color: 'var(--color-ink)', fontSize: '15px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', background: 'var(--color-seal)', color: '#F7F3EA', borderRadius: '3px', fontSize: '10px' }}>限</span>
          当季限定 · 别错过
        </span>
        <span style={{ color: 'var(--color-ink-faint)', fontSize: '13px' }}>{open ? '收起' : `展开 ${list.length} 条`}</span>
      </button>
      {open && (
        <div className="mt-3" style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
          {list.map((h, i) => (
            <div key={i}>
              <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'var(--color-ink)' }}>
                <span style={{ color: 'var(--color-seal)', marginRight: '6px' }}>◆</span>
                {h.title}
              </div>
              {h.detail && <div style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--color-ink-soft)', marginTop: '2px', paddingLeft: '16px' }}>{h.detail}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// 某一天可遇的特殊景观（日落/流星/天气相关），渲染在那天行程末尾
function DayPhenomena({ list }: { list: Phenomenon[] }) {
  return (
    <div className="mt-4 pl-3" style={{ borderLeft: '2px solid var(--color-qing-soft)' }}>
      <div className="font-serif" style={{ fontSize: '11.5px', letterSpacing: '0.06em', color: 'var(--color-qing)', marginBottom: '8px' }}>✦ 这天可遇</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {list.map((p, i) => {
          const lab = CHANCE_LABEL[p.chance]
          return (
            <div key={i} style={{ display: 'flex', gap: '8px' }}>
              <span aria-hidden style={{ fontSize: '14px', lineHeight: 1.5, flex: '0 0 auto' }}>{p.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', lineHeight: 1.55, color: 'var(--color-ink)' }}>
                  {p.title}
                  {lab && <span className="font-serif" style={{ marginLeft: '7px', color: lab.c, border: `1px solid ${lab.c}`, borderRadius: '3px', padding: '0 5px', fontSize: '10px' }}>{lab.t}</span>}
                </div>
                <div style={{ fontSize: '11.5px', lineHeight: 1.65, color: 'var(--color-ink-soft)', marginTop: '2px' }}>{p.detail}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
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
  const [weather, setWeather] = useState<Record<string, DayWeather>>({})

  const [weatherLoading, setWeatherLoading] = useState(false)
  const today = new Date().toLocaleDateString('en-CA')
  useEffect(() => {
    let alive = true
    setWeather({}); setWeatherLoading(true)
    Promise.all(data.days.map(async (day) => {
      const target = itineraryWeatherCity(city, day)
      if (!target || !day.date) return {}
      try { return await fetchWeather(target, [day.date]) } catch { return {} }
    })).then(rows => { if (alive) { setWeather(Object.assign({}, ...rows)); setWeatherLoading(false) } })
    return () => { alive = false }
  }, [city, JSON.stringify(data.days)])

  const mutDays = (d: number, fn: (day: Itinerary['days'][number]) => Itinerary['days'][number]) =>
    onChange?.({ ...data, days: data.days.map((day, x) => (x === d ? fn(day) : day)) })
  const patchItem = (d: number, s: number, i: number, p: Partial<Item>) =>
    mutDays(d, (day) => ({ ...day, segments: day.segments.map((seg, y) => (y === s ? { ...seg, items: seg.items.map((it, z) => (z === i ? { ...it, ...p } : it)) } : seg)) }))
  const removeItem = (d: number, s: number, i: number) =>
    mutDays(d, (day) => ({ ...day, segments: day.segments.map((seg, y) => (y === s ? { ...seg, items: seg.items.filter((_, z) => z !== i) } : seg)) }))
  const addItem = (d: number, s: number) =>
    mutDays(d, (day) => ({ ...day, segments: day.segments.map((seg, y) => (y === s ? { ...seg, items: [...seg.items, blankItem()] } : seg)) }))
  const setTheme = (d: number, v: string) => mutDays(d, (day) => ({ ...day, theme: v }))

  // 特殊景观按日期分组，渲染到对应那天行程末尾
  const phByDate: Record<string, Phenomenon[]> = {}
  for (const p of phenomena(city, data.days.map((d) => ({ date: d.date })), weather)) {
    ;(phByDate[p.date] ||= []).push(p)
  }

  return (
    <div>
      <blockquote style={{ fontFamily: '-apple-system, "PingFang SC", system-ui, sans-serif', fontSize: '14px', lineHeight: 1.75, color: 'var(--color-ink-soft)', margin: '20px 0', overflowWrap: 'anywhere' }}>
        {data.greeting}
      </blockquote>

      {data.weatherAlerts && data.weatherAlerts.length > 0 && <WeatherAlertBand alerts={data.weatherAlerts} />}
      {data.prep && data.prep.length > 0 && <PrepCard notes={data.prep} />}
      {data.highlights && data.highlights.length > 0 && <HighlightCard list={data.highlights} />}

      {data.days.map((day, d) => {
        const dayWeather = day.date ? weather[day.date] : undefined
        return (
        <section key={d} id={`trip-day-${day.dayIndex}`} className="mb-10 trip-day-section">
          <div className={`day-weather-header${dayWeather ? ' has-weather' : ''}`}>
            {dayWeather && <WeatherScene weather={dayWeather} />}
            <div className="day-weather-identity">
              <span className="day-label">DAY {String(day.dayIndex).padStart(2, '0')}</span>
              {day.date && <span className="day-date">{day.date}</span>}
            </div>
            {!dayWeather && <div className="day-weather-reading"><small>{!day.date ? '出发日期未定' : !forecastableDates([day.date], today).length ? '该日期暂无预报' : !(itineraryWeatherCity(city, day)) ? '当天城市暂未识别' : weatherLoading ? '天气查询中…' : '暂未获取天气'}</small></div>}
            {dayWeather && (
              <div className="day-weather-reading" title={`降水概率 ${dayWeather.pop}% · 最大风速 ${dayWeather.windMax}km/h`}>
                <span>{itineraryWeatherCity(city, day)} · {dayWeather.text}</span>
                <small>{dayWeather.tMin}° — {dayWeather.tMax}°</small>
              </div>
            )}
            {editing ? (
              <input value={day.theme} onChange={(e) => setTheme(d, e.target.value)} className="font-serif day-weather-theme" style={{ ...edInput }} />
            ) : (
              <span className="font-serif day-weather-theme">{day.theme}</span>
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
          {day.date && phByDate[day.date] && phByDate[day.date].length > 0 && <DayPhenomena list={phByDate[day.date]} />}
        </section>
      )})}

      <div style={{ fontFamily: '-apple-system, "PingFang SC", system-ui, sans-serif', fontSize: '14px', lineHeight: 1.75, color: 'var(--color-ink-soft)', overflowWrap: 'anywhere' }}>{data.closing}</div>
      <div className="mt-6" style={{ fontSize: '11px', lineHeight: 1.7, color: 'var(--color-ink-faint)' }}>{data.disclaimer}</div>

      {markSpot && <SpotDetail name={markSpot} city={city} onClose={() => setMarkSpot(null)} onSaved={onCheckin} />}
    </div>
  )
}
