import type { Itinerary } from '../types/itinerary'
import type { SavedItinerary } from '../lib/db'

const PACE_LABEL: Record<string, string> = {
  packed: '紧凑',
  balanced: '适中',
  leisurely: '溜达',
}

export default function SavedTrips({
  trips,
  loading,
  error,
  onRetry,
  onOpen,
  onBack,
}: {
  trips: SavedItinerary[]
  loading: boolean
  error: string
  onRetry: () => void
  onOpen: (it: Itinerary) => void
  onBack: () => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <span className="font-serif" style={{ fontSize: '18px', color: 'var(--color-ink)' }}>
          我的行程
        </span>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-soft)', fontSize: '13px', textDecoration: 'underline', textUnderlineOffset: '3px' }}
        >
          返回
        </button>
      </div>

      {loading && <p role="status">正在读取行程…</p>}
      {error && <p role="alert">{error} <button className="toolbar-button" onClick={onRetry}>重试</button></p>}
      {!loading && !error && trips.length === 0 && (
        <div style={{ fontSize: '13px', color: 'var(--color-ink-faint)', padding: '2rem 0', textAlign: 'center' }}>
          还没有记录。生成的行程会自动保存在这里。
        </div>
      )}

      {!loading && !error && trips.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t.plan)}
          className="w-full text-left py-4 transition"
          style={{ borderTop: '1px solid var(--color-line)', background: 'transparent', border: 'none', borderTopStyle: 'solid', cursor: 'pointer' }}
        >
          <div className="flex items-baseline gap-2">
            <span className="font-serif" style={{ fontSize: '17px', color: 'var(--color-ink)' }}>
              {t.meta.destination}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--color-ink-faint)' }}>
              {t.meta.days} 天 · {PACE_LABEL[t.meta.pace] || ''}
            </span>
          </div>
          <div className="mt-0.5" style={{ fontSize: '12px', color: 'var(--color-ink-soft)' }}>
            {(t.plan.greeting || '').slice(0, 28)}
            {(t.plan.greeting || '').length > 28 ? '…' : ''}
          </div>
        </button>
      ))}
    </div>
  )
}
