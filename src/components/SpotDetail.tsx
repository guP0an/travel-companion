import { useEffect, useState } from 'react'
import { getCheckin, saveCheckin, countCheckins, uploadPhotos } from '../lib/db'
import { badge } from '../lib/growth'
import AnimatedSheet, { AnimatedSheetClose, AnimatedSheetTitle } from './AnimatedSheet'

// 点评分两面：推荐(好)与踩坑(坑)。沿用 checkins.review 一个字段存 JSON，零迁移。
function parseReview(raw: string): { pros: string; cons: string } {
  if (!raw) return { pros: '', cons: '' }
  try {
    const o = JSON.parse(raw)
    if (o && typeof o === 'object' && ('pros' in o || 'cons' in o)) return { pros: o.pros || '', cons: o.cons || '' }
  } catch {
    /* 旧的纯文本点评，并入"推荐" */
  }
  return { pros: raw, cons: '' }
}
function packReview(pros: string, cons: string): string {
  const p = pros.trim()
  const c = cons.trim()
  return p || c ? JSON.stringify({ pros: p, cons: c }) : ''
}

export default function SpotDetail({ name, city, onClose, onSaved }: { name: string; city: string; onClose: () => void; onSaved?: () => void }) {
  const spot = (city ? city + ' ' : '') + name
  const mapUrl = `https://uri.amap.com/search?keyword=${encodeURIComponent(spot)}`
  const [rating, setRating] = useState(0)
  const [pros, setPros] = useState('') // 推荐
  const [cons, setCons] = useState('') // 踩坑
  const [tab, setTab] = useState<'pros' | 'cons'>('pros')
  const [checked, setChecked] = useState(false)
  const [photos, setPhotos] = useState<string[]>([]) // 云端已存的照片 URL
  const [newFiles, setNewFiles] = useState<File[]>([]) // 本次新选、尚未上传
  const [previews, setPreviews] = useState<string[]>([]) // 新选照片的本地预览
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [total, setTotal] = useState(0) // 已打卡的地方总数
  const [sheetOpen, setSheetOpen] = useState(true)

  useEffect(() => {
    getCheckin(spot)
      .then((c) => {
        if (c) {
          setRating(c.rating || 0)
          const r = parseReview(c.review || '')
          setPros(r.pros)
          setCons(r.cons)
          setChecked(!!c.checked_at)
          setPhotos(c.photos || [])
        }
      })
      .catch(() => {})
    countCheckins().then(setTotal).catch(() => {})
  }, [spot])

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files || [])
    setNewFiles((p) => [...p, ...fs])
    setPreviews((p) => [...p, ...fs.map((f) => URL.createObjectURL(f))])
    e.target.value = ''
  }

  const doCheckin = async () => {
    setMsg('')
    setBusy(true)
    const wasNew = !checked
    try {
      let allPhotos = photos
      if (newFiles.length) {
        const uploaded = await uploadPhotos(newFiles)
        allPhotos = [...photos, ...uploaded]
        setPhotos(allPhotos)
        setNewFiles([])
        setPreviews([])
      }
      await saveCheckin({ spot, rating: rating || null, review: packReview(pros, cons), checked: true, photos: allPhotos })
      setChecked(true)
      const n = wasNew ? total + 1 : total
      setTotal(n)
      const t = badge(n)
      setMsg(wasNew ? `打卡成功！这是你打卡的第 ${n} 个地方${t ? ` · ${t}` : ''}` : '已更新')
      onSaved?.()
    } catch (e) {
      const m = (e as Error).message
      if (m.includes('checkins') || m.includes('schema cache')) setMsg('打卡功能还没启用：先在 Supabase 跑 checkins 建表 SQL')
      else if (m.toLowerCase().includes('bucket') || m.includes('checkin-photos')) setMsg('照片云存储还没启用：先在 Supabase 建 checkin-photos 存储桶（见 supabase/storage.sql）')
      else setMsg(m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatedSheet open={sheetOpen} onOpenChange={setSheetOpen} onExitComplete={onClose}>
      <div className="flex items-center justify-between mb-1">
        <AnimatedSheetTitle asChild>
          <span className="font-serif" style={{ fontSize: '19px', color: 'var(--color-ink)' }}>{name}</span>
        </AnimatedSheetTitle>
        <AnimatedSheetClose asChild>
          <button aria-label="关闭打卡详情" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-faint)', fontSize: '18px' }}>×</button>
        </AnimatedSheetClose>
      </div>
      <a href={mapUrl} target="_blank" rel="noreferrer" style={{ fontSize: '12.5px', color: 'var(--color-qing)' }}>◍ 在地图上看位置</a>
      {total > 0 && (
        <div className="mt-2" style={{ fontSize: '12px', color: 'var(--color-ink-faint)' }}>
          你已打卡过 <span style={{ color: 'var(--color-seal)' }}>{total}</span> 个地方
          {badge(total) && <span className="font-serif" style={{ marginLeft: '8px', color: 'var(--color-seal)', border: '1px solid var(--color-seal)', borderRadius: '3px', padding: '1px 6px', fontSize: '11px' }}>{badge(total)}</span>}
        </div>
      )}

      {/* 评分 */}
      <div className="mt-5" style={{ fontSize: '12px', color: 'var(--color-ink-faint)', marginBottom: '4px' }}>评分</div>
      <div style={{ display: 'flex', gap: '4px' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} 星`} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', lineHeight: 1, color: n <= rating ? '#E0B23C' : 'var(--color-line)' }}>
            ★
          </button>
        ))}
      </div>

      {/* 点评：推荐 / 踩坑 两面 */}
      <div className="mt-5 flex items-center gap-1" style={{ fontSize: '12px', color: 'var(--color-ink-faint)', marginBottom: '8px' }}>
        <span>留句话给后来人</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        {([
          { k: 'pros', label: '推荐', emoji: '👍', color: 'var(--color-qing)', has: !!pros.trim() },
          { k: 'cons', label: '踩坑', emoji: '⚠️', color: 'var(--color-seal)', has: !!cons.trim() },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className="font-serif"
            style={{
              flex: 1, padding: '7px 0', borderRadius: '8px', cursor: 'pointer', fontSize: '13.5px',
              border: tab === t.k ? `1px solid ${t.color}` : '1px solid var(--color-line)',
              background: tab === t.k ? (t.k === 'pros' ? 'var(--color-qing-soft)' : '#F6E6E2') : 'transparent',
              color: tab === t.k ? t.color : 'var(--color-ink-soft)',
            }}
          >
            {t.emoji} {t.label}
            {t.has && <span style={{ marginLeft: '5px', color: t.color }}>·</span>}
          </button>
        ))}
      </div>
      <textarea
        value={tab === 'pros' ? pros : cons}
        onChange={(e) => (tab === 'pros' ? setPros(e.target.value) : setCons(e.target.value))}
        placeholder={tab === 'pros' ? '哪儿好——风景、吃食、体验，安利给后来人…' : '哪儿要当心——排队、宰客、难找、货不对板，替人避个雷…'}
        className="font-serif"
        style={{ fieldSizing: 'content', width: '100%', minHeight: '52px', border: `1px solid ${tab === 'pros' ? 'var(--color-qing)' : 'var(--color-seal)'}`, borderRadius: '8px', background: 'var(--color-paper-2)', padding: '8px 10px', outline: 'none', resize: 'none', fontSize: '14px', color: 'var(--color-ink)', lineHeight: 1.7 } as React.CSSProperties}
      />

      {/* 照片 */}
      <div className="mt-5 flex items-center gap-2 flex-wrap">
        {photos.map((p, i) => (
          <img key={'u' + i} src={p} alt="" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px' }} />
        ))}
        {previews.map((p, i) => (
          <img key={'n' + i} src={p} alt="" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', opacity: 0.7 }} />
        ))}
        <label style={{ width: '56px', height: '56px', borderRadius: '8px', border: '1px dashed var(--color-qing)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-qing)', fontSize: '20px', cursor: 'pointer' }}>
          ＋
          <input type="file" accept="image/*" multiple onChange={onPhoto} style={{ display: 'none' }} />
        </label>
      </div>
      {newFiles.length > 0 && <div style={{ fontSize: '11px', color: 'var(--color-ink-faint)', marginTop: '6px' }}>{newFiles.length} 张新照片将在打卡时上传云端</div>}

      <button
        onClick={doCheckin}
        disabled={busy}
        className="font-serif disabled:opacity-60"
        style={{ width: '100%', marginTop: '20px', padding: '11px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: checked ? 'var(--color-qing)' : 'var(--color-seal)', color: '#F7F3EA', fontSize: '15px', letterSpacing: '0.08em' }}
      >
        {busy ? '保存中…' : checked ? '✓ 已打卡（保存修改）' : '在这儿打卡'}
      </button>
      {msg && <div className="mt-2" style={{ fontSize: '12px', color: 'var(--color-qing)' }}>{msg}</div>}
    </AnimatedSheet>
  )
}
