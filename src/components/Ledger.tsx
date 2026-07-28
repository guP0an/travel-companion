import { useEffect, useMemo, useState } from 'react'
import { addExpense, assignExpenseToItinerary, deleteExpense, listExpenses, listMyItineraries, type Expense, type SavedItinerary } from '../lib/db'
import { ledgerSummary } from '../../shared/ledger'

const CATS = ['餐饮', '交通', '门票', '住宿', '购物', '其他']

export default function Ledger({ currentTripId, onBack }: { currentTripId: string | null; onBack: () => void }) {
  const [rows, setRows] = useState<Expense[]>([])
  const [trips, setTrips] = useState<SavedItinerary[]>([])
  const [directory, setDirectory] = useState(!currentTripId)
  const [selectedId, setSelectedId] = useState<string | null>(currentTripId)
  const [cat, setCat] = useState('餐饮')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [receipts, setReceipts] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const friendly = (e: unknown) => {
    const message = (e as Error).message || ''
    if (message.includes('receipt_paths') || message.includes('expense-receipts') || message.toLowerCase().includes('bucket')) return '凭证保存暂不可用，请稍后再试'
    if (message.includes('itinerary_id')) return '账本关联字段还没启用，请先运行 ledger-itineraries.sql'
    if (message.includes('expenses') || message.includes('schema cache')) return '账本还没启用：先去 Supabase 跑一下 expenses 建表 SQL'
    return message
  }

  const load = () => {
    Promise.all([listExpenses(), listMyItineraries()])
      .then(([expenses, saved]) => {
        setRows(expenses)
        setTrips(saved)
      })
      .catch((error) => setErr(friendly(error)))
  }
  useEffect(load, [])

  const summaries = useMemo(() => ledgerSummary(
    trips.map((trip) => ({ id: trip.id, destination: trip.meta.destination })),
    rows,
  ), [rows, trips])
  const visibleRows = rows.filter((row) => row.itinerary_id === selectedId)
  const selectedTrip = trips.find((trip) => trip.id === selectedId)
  const title = selectedId ? selectedTrip?.meta.destination || '本次行程' : '历史未归档'
  const total = visibleRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const receiptPreviews = useMemo(() => receipts.map((file) => URL.createObjectURL(file)), [receipts])
  useEffect(() => () => receiptPreviews.forEach(URL.revokeObjectURL), [receiptPreviews])

  const chooseReceipts = (files: FileList | null) => {
    if (!files) return
    const images = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (images.length !== files.length) setErr('凭证只能上传图片')
    setReceipts((current) => [...current, ...images].slice(0, 3))
  }

  const add = async () => {
    const value = Number(amount)
    if (!selectedId) return
    if (!value) {
      setErr('填个金额呀')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await addExpense({ itinerary_id: selectedId, category: cat, amount: value, note: note.trim() }, receipts)
      setAmount('')
      setNote('')
      setReceipts([])
      load()
    } catch (error) {
      setErr(friendly(error))
    } finally {
      setBusy(false)
    }
  }

  const del = async (id: string) => {
    await deleteExpense(id)
    load()
  }

  const assign = async (expenseId: string, itineraryId: string) => {
    if (!itineraryId) return
    try {
      await assignExpenseToItinerary(expenseId, itineraryId)
      load()
    } catch (error) {
      setErr(friendly(error))
    }
  }

  const openBook = (id: string | null) => {
    setSelectedId(id)
    setDirectory(false)
    setErr('')
  }

  const underline: React.CSSProperties = {
    border: 'none',
    borderBottom: '1px solid var(--color-line)',
    background: 'transparent',
    padding: '6px 2px',
    outline: 'none',
    fontSize: '14px',
    color: 'var(--color-ink)',
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-5">
        <span className="font-serif" style={{ fontSize: '18px', color: 'var(--color-ink)' }}>{directory ? '账本目录' : `${title} · 账本`}</span>
        <div className="ledger-header-actions">
          {!directory && <button onClick={() => setDirectory(true)}>账本目录</button>}
          <button onClick={onBack}>返回行程</button>
        </div>
      </div>

      {directory ? (
        <div className="ledger-directory">
          {summaries.map((summary) => (
            <button key={summary.id || 'unassigned'} onClick={() => openBook(summary.id)}>
              <span>
                <strong className="font-serif">{summary.destination}</strong>
                <small>{summary.count ? `${summary.count} 笔` : '还没有记录'}</small>
              </span>
              <b className="font-serif">¥{summary.total.toLocaleString()}</b>
            </button>
          ))}
          {summaries.length === 0 && <p>还没有行程账本</p>}
        </div>
      ) : (
        <>
          <div className="mb-6" style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-ink-faint)' }}>这趟共花</span>
            <span className="font-serif" style={{ fontSize: '28px', color: 'var(--color-ink)' }}>¥{total.toLocaleString()}</span>
          </div>

          {selectedId && (
            <div className="mb-6" style={{ border: '1px solid var(--color-line)', borderRadius: '10px', padding: '12px' }}>
              <div className="flex flex-wrap gap-2 mb-3">
                {CATS.map((category) => (
                  <button
                    key={category}
                    onClick={() => setCat(category)}
                    style={{
                      fontSize: '12.5px',
                      padding: '4px 11px',
                      borderRadius: '999px',
                      cursor: 'pointer',
                      border: cat === category ? '1px solid var(--color-qing)' : '1px solid var(--color-line)',
                      background: cat === category ? 'var(--color-qing-soft)' : 'transparent',
                      color: cat === category ? 'var(--color-qing)' : 'var(--color-ink-soft)',
                    }}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 items-end">
                <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="金额 ¥" className="font-serif" style={{ ...underline, width: '90px' }} />
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注（选填）" style={{ ...underline, flex: 1 }} />
                <button onClick={add} disabled={busy} aria-label="记一笔" className="font-serif disabled:opacity-60" style={{ background: 'var(--color-seal)', color: '#F7F3EA', border: 'none', borderRadius: '6px', width: '40px', height: '46px', flex: '0 0 auto', writingMode: 'vertical-rl', letterSpacing: '3px', fontSize: '13px', lineHeight: 1, cursor: 'pointer' }}>
                  记一笔
                </button>
              </div>
              <div className="ledger-receipt-picker">
                <label>
                  ＋ 添加凭证
                  <input type="file" accept="image/*" multiple onChange={(event) => { chooseReceipts(event.target.files); event.target.value = '' }} />
                </label>
                {receipts.length > 0 && <span>已选 {receipts.length} 张</span>}
              </div>
              {receiptPreviews.length > 0 && (
                <div className="ledger-receipt-previews">
                  {receiptPreviews.map((url, index) => (
                    <button key={url} onClick={() => setReceipts((files) => files.filter((_, itemIndex) => itemIndex !== index))} title="移除这张凭证">
                      <img src={url} alt={`待上传凭证 ${index + 1}`} />
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {err && <div className="mb-3" style={{ fontSize: '12px', color: 'var(--color-seal)' }}>{err}</div>}
          {visibleRows.length === 0 && (
            <div style={{ fontSize: '13px', color: 'var(--color-ink-faint)', textAlign: 'center', padding: '1.5rem 0' }}>{selectedId ? '这趟还没记账，上面记第一笔吧' : '没有未归档的历史记录'}</div>
          )}
          {visibleRows.map((row) => (
            <div key={row.id} className="ledger-row">
              <span className="ledger-category">{row.category}</span>
              <div className="ledger-row-main">
                <span>{row.note || '—'}</span>
                {row.receipt_urls.length > 0 && (
                  <div className="ledger-receipt-images">
                    {row.receipt_urls.map((url, index) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" title="查看凭证原图">
                        <img src={url} alt={`消费凭证 ${index + 1}`} />
                      </a>
                    ))}
                  </div>
                )}
                {!selectedId && trips.length > 0 && (
                  <select defaultValue="" onChange={(event) => assign(row.id, event.target.value)} aria-label="归入行程">
                    <option value="" disabled>归入哪趟行程…</option>
                    {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.meta.destination}</option>)}
                  </select>
                )}
              </div>
              <span className="font-serif" style={{ fontSize: '15px', color: 'var(--color-ink)' }}>¥{Number(row.amount).toLocaleString()}</span>
              <button onClick={() => del(row.id)}>删</button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
