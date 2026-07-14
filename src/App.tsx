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
import { useSession } from './lib/useSession'
import { saveItinerary, listMyItineraries, countCheckins, type SavedItinerary } from './lib/db'
import { growth } from './lib/growth'

const PAPER = '#F7F3EA'

export default function App() {
  const [data, setData] = useState(kyotoMock)
  const session = useSession()
  const [count, setCount] = useState<number | null>(null)
  const [checkins, setCheckins] = useState(0)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [view, setView] = useState<'plan' | 'saved' | 'ledger'>('plan')
  const [editing, setEditing] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [trips, setTrips] = useState<SavedItinerary[]>([])
  const printRef = useRef<HTMLDivElement>(null)
  const plannerRef = useRef<HTMLElement>(null)
  const resultRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!session) {
      setCount(null)
      setCheckins(0)
      return
    }
    listMyItineraries()
      .then((rows) => setCount(rows.length))
      .catch(() => setCount(null))
    countCheckins().then(setCheckins).catch(() => setCheckins(0))
  }, [session])

  const g = growth(checkins)

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

  const showResult = (it: typeof data) => {
    setData(it)
    setGenerated(true)
    if (window.matchMedia('(max-width: 820px)').matches) {
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    }
  }

  const focusPlanner = () => {
    plannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => {
      const field = plannerRef.current?.querySelector('textarea, input') as HTMLElement | null
      field?.focus()
    }, 220)
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <button className="brand-lockup" onClick={() => setView('plan')} aria-label="返回丸丸规划页">
          <Mascot size={40} hop />
          <span>
            <span className="brand-name font-serif">
              丸丸
              <span className="brand-seal font-serif" aria-hidden>印</span>
            </span>
            <span className="brand-subtitle">你的旅行管家</span>
          </span>
        </button>
        <div className="topbar-actions">
          <CurrentCity />
          <AuthBar />
        </div>
      </header>

      {view === 'saved' ? (
        <main className="library-view">
          <SavedTrips
            trips={trips}
            onOpen={(it) => {
              setData(it)
              setGenerated(true)
              setView('plan')
            }}
            onBack={() => setView('plan')}
          />
        </main>
      ) : view === 'ledger' ? (
        <main className="library-view"><Ledger onBack={() => setView('plan')} /></main>
      ) : (
        <main className="planner-workspace">
          <aside className="planner-sidebar" ref={plannerRef}>
            <div className="planner-intro">
              <div className="section-eyebrow">AI TRAVEL CONCIERGE</div>
              <h1 className="font-serif">把想去的地方<br />交给丸丸</h1>
              <p>说目的地，也可以只丢给我一张票。丸丸会结合天气、节奏和你的偏好，排成一份能直接出发的行程。</p>
            </div>
            <PlanForm
              current={data}
              hasPlan={generated}
              onResult={showResult}
              onReset={() => setGenerated(false)}
            />
            <div className="planner-status">
              丸丸 Lv.{g.lv} · {g.name}
              {session && checkins > 0 ? ` · 打卡 ${checkins} 处` : ''}
              {session && g.next != null && (
                <span>{` · 再打卡 ${g.next - checkins} 处升级`}</span>
              )}
            </div>
          </aside>

          <section className="itinerary-workspace" ref={resultRef}>
            {!generated ? (
              <div className="itinerary-empty">
                <div className="section-eyebrow">YOUR TRIP</div>
                <div className="itinerary-empty-body">
                  <Mascot size={62} hop />
                  <h2 className="font-serif">{session ? '还没有正在规划的行程' : '你的行程会在这里展开'}</h2>
                  <p>
                    {session
                      ? '从左边告诉丸丸想去哪、玩几天，也可以上传一张票。'
                      : '登录后，从左边说说想去哪。丸丸会把零散想法整理成一份能直接出发的行程。'}
                  </p>
                  <div className="itinerary-empty-actions">
                    <button onClick={focusPlanner} className="toolbar-button emphasized">
                      {session ? '开始规划' : '从左侧填写'}
                    </button>
                    {session && count != null && count > 0 && (
                      <button onClick={openSaved} className="toolbar-button">
                        <IcoScroll /> 打开我的行程 · {count} 份
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="itinerary-toolbar">
                  <div>
                    <div className="section-eyebrow">YOUR ITINERARY</div>
                    <div className="itinerary-title font-serif">{data.meta.destination} · {data.meta.days} 天</div>
                    <div className="itinerary-meta">已按你的要求生成，可继续让丸丸调整</div>
                  </div>
                  <div className="itinerary-actions">
                    {session && (
                      <>
                        <button onClick={openSaved} className="toolbar-button">
                          <IcoScroll /> 我的行程 · {count ?? '…'} 份
                        </button>
                        <button onClick={() => setView('ledger')} className="toolbar-button">
                          <IcoCoin /> 账本
                        </button>
                        <button onClick={onSave} disabled={saving} className="toolbar-button emphasized">
                          {saving ? '收藏中…' : '收藏此程'}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setEditing((value) => !value)}
                      className={`toolbar-button${editing ? ' active' : ''}`}
                    >
                      <IcoBrush /> {editing ? '完成编辑' : '编辑行程'}
                    </button>
                  </div>
                </div>
                {note && <div className="workspace-note">{note}</div>}

                <nav className="day-quick-nav" aria-label="行程日期">
                  {data.days.map((day) => (
                    <a key={day.dayIndex} href={`#trip-day-${day.dayIndex}`}>
                      第{day.dayIndex}天{day.date ? ` · ${day.date.slice(5)}` : ''}
                    </a>
                  ))}
                </nav>

                <div ref={printRef} className="itinerary-sheet" style={{ background: PAPER }}>
                  <div className="sheet-brand">
                    <Mascot size={34} />
                    <div>
                      <div className="font-serif sheet-title">
                        {data.meta.destination} · {data.meta.days} 天
                      </div>
                      <div className="sheet-subtitle">丸丸 · 你的旅行管家</div>
                    </div>
                  </div>
                  <ResultView data={data} editing={editing} onChange={setData} onCheckin={() => countCheckins().then(setCheckins).catch(() => {})} />
                </div>

                <div className="export-row">
                  <button onClick={exportImage} className="export-button font-serif">保存为分享图片</button>
                </div>
                <div className="mobile-action-bar">
                  <button onClick={focusPlanner}>调整行程</button>
                  <button onClick={exportImage}>保存图片</button>
                </div>
              </>
            )}
          </section>
        </main>
      )}

      <footer className="app-footer">丸丸 · 你的旅行管家</footer>
    </div>
  )
}
