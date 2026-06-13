import { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import ResultView from './components/ResultView'
import AuthBar from './components/AuthBar'
import PlanForm from './components/PlanForm'
import SavedTrips from './components/SavedTrips'
import CurrentCity from './components/CurrentCity'
import Ledger from './components/Ledger'
import { Mascot } from './components/Mascot'
import { IcoScroll, IcoCoin, IcoBrush } from './components/Icons'
import { kyotoMock } from './mock/kyoto'
import { revisePlan } from './lib/plan'
import { useSession } from './lib/useSession'
import { saveItinerary, listMyItineraries, type SavedItinerary } from './lib/db'

const PAPER = '#F7F3EA'

export default function App() {
  const [data, setData] = useState(kyotoMock)
  const session = useSession()
  const [count, setCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [view, setView] = useState<'plan' | 'saved' | 'ledger'>('plan')
  const [editing, setEditing] = useState(false)
  const [reviseText, setReviseText] = useState('')
  const [revising, setRevising] = useState(false)

  const doRevise = async () => {
    if (!reviseText.trim()) return
    setRevising(true)
    try {
      setData(await revisePlan(data, reviseText.trim()))
      setReviseText('')
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setRevising(false)
    }
  }
  const [trips, setTrips] = useState<SavedItinerary[]>([])
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!session) {
      setCount(null)
      return
    }
    listMyItineraries()
      .then((rows) => setCount(rows.length))
      .catch(() => setCount(null))
  }, [session])

  const onSave = async () => {
    setSaving(true)
    setNote('')
    try {
      await saveItinerary(data)
      setNote('已收藏到云端')
      const rows = await listMyItineraries()
      setCount(rows.length)
    } catch (e) {
      setNote('收藏失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const openSaved = async () => {
    try {
      setTrips(await listMyItineraries())
    } catch {
      setTrips([])
    }
    setView('saved')
  }

  const exportImage = async () => {
    if (!printRef.current) return
    const url = await toPng(printRef.current, { pixelRatio: 2, backgroundColor: PAPER })
    const a = document.createElement('a')
    a.href = url
    a.download = `丸丸-${data.meta.destination}.png`
    a.click()
  }

  const btnEdge: React.CSSProperties = {
    width: '60%',
    padding: '13px',
    border: '1px solid var(--color-qing)',
    color: 'var(--color-qing)',
    background: 'transparent',
    borderRadius: '999px',
    fontSize: '14px',
    letterSpacing: '0.06em',
    cursor: 'pointer',
  }

  return (
    <div className="min-h-full flex justify-center px-6 py-12">
      <div className="w-full max-w-[460px]">
        {/* 顶部：丸丸 + 朱砂印 */}
        <header className="flex items-center gap-3 mb-8">
          <Mascot size={46} hop />
          <div>
            <div className="font-serif flex items-center gap-2" style={{ fontSize: '19px', color: 'var(--color-ink)', letterSpacing: '0.04em' }}>
              丸丸
              <span
                className="font-serif"
                aria-hidden
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '17px', height: '17px', background: 'var(--color-seal)', color: '#F7F3EA', borderRadius: '3px', fontSize: '10px' }}
              >
                印
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-ink-faint)', letterSpacing: '0.05em', marginTop: '1px' }}>
              {data.meta.destination} · {data.meta.days} 天 · 已按你的脾气排好
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-qing)', letterSpacing: '0.04em', marginTop: '3px' }}>
              丸丸 Lv.1 · 初级丸子
              {session && count != null ? ` · 收藏 ${count} 程` : ''}
            </div>
          </div>
        </header>

        <CurrentCity />

        <AuthBar />

        {view === 'saved' ? (
          <SavedTrips
            trips={trips}
            onOpen={(it) => {
              setData(it)
              setView('plan')
            }}
            onBack={() => setView('plan')}
          />
        ) : view === 'ledger' ? (
          <Ledger onBack={() => setView('plan')} />
        ) : (
          <>
            <PlanForm onResult={setData} />

            {session && (
              <div className="flex items-center justify-between mb-2" style={{ fontSize: '12px', color: 'var(--color-ink-faint)' }}>
                <span style={{ display: 'flex', gap: '16px' }}>
                  <button
                    onClick={openSaved}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-soft)', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <IcoScroll /> 我的行程 · {count ?? '…'} 份
                  </button>
                  <button
                    onClick={() => setView('ledger')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-soft)', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <IcoCoin /> 账本
                  </button>
                </span>
                <button
                  onClick={onSave}
                  disabled={saving}
                  className="font-serif disabled:opacity-60"
                  style={{ background: 'transparent', border: '1px solid var(--color-line)', borderRadius: '999px', padding: '5px 16px', fontSize: '12.5px', color: 'var(--color-ink)', cursor: 'pointer' }}
                >
                  {saving ? '收藏中…' : '收藏此程'}
                </button>
              </div>
            )}
            {note && <div className="mb-2" style={{ fontSize: '12px', color: 'var(--color-qing)' }}>{note}</div>}

            {/* 一句话改行程 */}
            <div className="flex gap-2 items-center mb-3" style={{ borderTop: '1px solid var(--color-line)', paddingTop: '12px' }}>
              <input
                value={reviseText}
                onChange={(e) => setReviseText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doRevise()}
                placeholder="想改哪天？如：6月20号加个夜市、删掉清水寺"
                className="font-serif"
                style={{ flex: 1, minWidth: 0, border: 'none', borderBottom: '1px solid var(--color-line)', background: 'transparent', outline: 'none', fontSize: '13px', color: 'var(--color-ink)', padding: '5px 2px' }}
              />
              <button
                onClick={doRevise}
                disabled={revising}
                className="font-serif disabled:opacity-60"
                style={{ flex: '0 0 auto', background: 'var(--color-qing)', color: 'var(--color-paper-2)', border: 'none', borderRadius: '999px', padding: '6px 14px', fontSize: '12.5px', cursor: 'pointer' }}
              >
                {revising ? '改…' : '让丸丸改'}
              </button>
            </div>

            <div className="flex justify-end mb-1">
              <button
                onClick={() => setEditing((v) => !v)}
                className="font-serif"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12.5px', color: editing ? 'var(--color-qing)' : 'var(--color-ink-soft)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <IcoBrush /> {editing ? '完成编辑' : '编辑行程'}
              </button>
            </div>

            {/* 可导出的分享卡：带丸丸 + 标题 + 留白，避免裁切 */}
            <div ref={printRef} style={{ background: PAPER, padding: '26px 22px' }}>
              <div className="flex items-center gap-2.5 mb-1">
                <Mascot size={34} />
                <div>
                  <div className="font-serif" style={{ fontSize: '17px', color: 'var(--color-ink)' }}>
                    {data.meta.destination} · {data.meta.days} 天
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-ink-faint)', letterSpacing: '0.06em' }}>
                    丸丸 · 你的旅行管家
                  </div>
                </div>
              </div>
              <ResultView data={data} editing={editing} onChange={setData} />
            </div>

            {/* 保存图片（去掉了 PDF） */}
            <div className="flex justify-center mt-8">
              <button onClick={exportImage} className="font-serif" style={btnEdge}>保存图片</button>
            </div>
          </>
        )}

        <footer className="mt-12 text-center" style={{ fontSize: '11px', color: 'var(--color-ink-faint)', letterSpacing: '0.08em' }}>
          丸丸 · 你的旅行管家
        </footer>
      </div>
    </div>
  )
}
