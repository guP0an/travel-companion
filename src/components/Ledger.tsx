import { useEffect, useMemo, useState } from 'react'
import { listExpenses, addExpense, deleteExpense, type Expense } from '../lib/db'

const CATS = ['餐饮', '交通', '门票', '住宿', '购物', '其他']

export default function Ledger({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Expense[]>([])
  const [cat, setCat] = useState('餐饮')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [receipts, setReceipts] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const friendly = (e: unknown) => {
    const m = (e as Error).message || ''
    if (m.includes('receipt_paths') || m.includes('expense-receipts') || m.toLowerCase().includes('bucket')) return '凭证保存暂不可用，请稍后再试'
    if (m.includes('expenses') || m.includes('schema cache')) return '账本还没启用：先去 Supabase 跑一下 expenses 建表 SQL'
    return m
  }

  const load = () => {
    listExpenses()
      .then(setRows)
      .catch((e) => setErr(friendly(e)))
  }
  useEffect(load, [])

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const receiptPreviews = useMemo(() => receipts.map((file) => URL.createObjectURL(file)), [receipts])
  useEffect(() => () => receiptPreviews.forEach(URL.revokeObjectURL), [receiptPreviews])

  const chooseReceipts = (files: FileList | null) => {
    if (!files) return
    const images = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (images.length !== files.length) setErr('凭证只能上传图片')
    setReceipts((current) => [...current, ...images].slice(0, 3))
  }

  const add = async () => {
    const amt = Number(amount)
    if (!amt) {
      setErr('填个金额呀')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await addExpense({ category: cat, amount: amt, note: note.trim() }, receipts)
      setAmount('')
      setNote('')
      setReceipts([])
      load()
    } catch (e) {
      setErr(friendly(e))
    } finally {
      setBusy(false)
    }
  }

  const del = async (id: string) => {
    await deleteExpense(id)
    load()
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
        <span className="font-serif" style={{ fontSize: '18px', color: 'var(--color-ink)' }}>账本</span>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-soft)', fontSize: '13px', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
          返回
        </button>
      </div>

      <div className="mb-6" style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--color-ink-faint)' }}>这趟共花</span>
        <span className="font-serif" style={{ fontSize: '28px', color: 'var(--color-ink)' }}>¥{total.toLocaleString()}</span>
      </div>

      {/* 记一笔 */}
      <div className="mb-6" style={{ border: '1px solid var(--color-line)', borderRadius: '10px', padding: '12px' }}>
        <div className="flex flex-wrap gap-2 mb-3">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              style={{
                fontSize: '12.5px',
                padding: '4px 11px',
                borderRadius: '999px',
                cursor: 'pointer',
                border: cat === c ? '1px solid var(--color-qing)' : '1px solid var(--color-line)',
                background: cat === c ? 'var(--color-qing-soft)' : 'transparent',
                color: cat === c ? 'var(--color-qing)' : 'var(--color-ink-soft)',
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-3 items-end">
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="金额 ¥" className="font-serif" style={{ ...underline, width: '90px' }} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（选填）" style={{ ...underline, flex: 1 }} />
          <button
            onClick={add}
            disabled={busy}
            aria-label="记一笔"
            className="font-serif disabled:opacity-60"
            style={{ background: 'var(--color-seal)', color: '#F7F3EA', border: 'none', borderRadius: '6px', width: '40px', height: '46px', flex: '0 0 auto', writingMode: 'vertical-rl', letterSpacing: '3px', fontSize: '13px', lineHeight: 1, cursor: 'pointer' }}
          >
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
              <button key={url} onClick={() => setReceipts((files) => files.filter((_, i) => i !== index))} title="移除这张凭证">
                <img src={url} alt={`待上传凭证 ${index + 1}`} />
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        )}
        {err && <div className="mt-2" style={{ fontSize: '12px', color: 'var(--color-seal)' }}>{err}</div>}
      </div>

      {/* 流水 */}
      {rows.length === 0 && (
        <div style={{ fontSize: '13px', color: 'var(--color-ink-faint)', textAlign: 'center', padding: '1.5rem 0' }}>还没记账，上面记第一笔吧</div>
      )}
      {rows.map((r) => (
        <div key={r.id} className="ledger-row">
          <span style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '999px', background: 'var(--color-qing-soft)', color: 'var(--color-qing)', flex: '0 0 auto' }}>{r.category}</span>
          <div className="ledger-row-main">
            <span>{r.note || '—'}</span>
            {r.receipt_urls.length > 0 && (
              <div className="ledger-receipt-images">
                {r.receipt_urls.map((url, index) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" title="查看凭证原图">
                    <img src={url} alt={`消费凭证 ${index + 1}`} />
                  </a>
                ))}
              </div>
            )}
          </div>
          <span className="font-serif" style={{ fontSize: '15px', color: 'var(--color-ink)' }}>¥{Number(r.amount).toLocaleString()}</span>
          <button onClick={() => del(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-faint)', fontSize: '11px' }}>删</button>
        </div>
      ))}
    </div>
  )
}
