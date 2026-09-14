import { useRef, useState } from 'react'
import type { Itinerary } from '../types/itinerary'
import { readTripDocument } from '../lib/importDocument'
import { importPlan } from '../lib/plan'

export default function ImportTrip({ onResult }: { onResult: (plan: Itinerary) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [filename, setFilename] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const running = useRef(false)
  async function read(file?: File) {
    if (!file || running.current) return
    running.current = true; setBusy(true); setError(''); setStatus('正在读取文件…')
    try {
      const content = await readTripDocument(file, setStatus)
      setText(content); setFilename(file.name)
    } catch (e) { setError((e as Error).message) }
    finally { running.current = false; setBusy(false); setStatus('') }
  }
  async function format() {
    if (running.current || !text.trim()) return
    running.current = true; setBusy(true); setError(''); setStatus('正在整理原有行程…')
    try {
      onResult(await importPlan(text.trim()))
      setOpen(false)
    } catch (e) { setError((e as Error).message) }
    finally { running.current = false; setBusy(false); setStatus('') }
  }
  return <section className="trip-import">
    <button className="trip-import-toggle" aria-expanded={open} onClick={() => setOpen(!open)} disabled={busy}>导入已有行程 <span aria-hidden>{open ? '−' : '+'}</span></button>
    {open && <div className="trip-import-body">
      <p>保留原来的安排，整理成行程卡片。</p>
      <button className="toolbar-button" onClick={() => fileInput.current?.click()} disabled={busy}>选择文档或图片</button>
      <input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void read(file) }} />
      <small>PDF、Word、文本或图片 · 单个文件 ≤15MB</small>
      {filename && <div className="trip-import-filename">{filename}</div>}
      <label htmlFor="trip-import-text">核对内容，也可以直接粘贴文字</label>
      <textarea id="trip-import-text" value={text} maxLength={20_000} disabled={busy} rows={7} onChange={e => setText(e.target.value)} placeholder="例如：第一天，上午抵达大理，下午逛古城…" />
      <small>确认后将文字交给 AI 整理，并保存到“我的行程”。</small>
      {status && <p role="status">{status}</p>}
      {error && <p className="trip-import-error" role="alert">{error}</p>}
      <button className="trip-import-submit" onClick={() => { void format() }} disabled={busy || !text.trim()}>整理成行程卡片</button>
    </div>}
  </section>
}
