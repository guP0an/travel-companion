import { useEffect, useState } from 'react'
import { getCheckin, saveCheckin, countCheckins, uploadPhotos } from '../lib/db'
import { badge } from '../lib/growth'

export default function SpotDetail({ name, city, onClose, onSaved }: { name: string; city: string; onClose: () => void; onSaved?: () => void }) {
  const spot = (city ? city + ' ' : '') + name
  const mapUrl = `https://uri.amap.com/search?keyword=${encodeURIComponent(spot)}`
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [checked, setChecked] = useState(false)
  const [photos, setPhotos] = useState<string[]>([]) // 云端已存的照片 URL
  const [newFiles, setNewFiles] = useState<File[]>([]) // 本次新选、尚未上传
  const [previews, setPreviews] = useState<string[]>([]) // 新选照片的本地预览
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [total, setTotal] = useState(0) // 已打卡的地方总数

  useEffect(() => {
    getCheckin(spot)
      .then((c) => {
        if (c) {
          setRating(c.rating || 0)
          setReview(c.review || '')
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
      await saveCheckin({ spot, rating: rating || null, review: review.trim(), checked: true, photos: allPhotos })
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
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(40,38,34,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-paper)', width: '100%', maxWidth: '460px', borderRadius: '16px 16px 0 0', padding: '20px 22px 28px', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="font-serif" style={{ fontSize: '19px', color: 'var(--color-ink)' }}>{name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-faint)', fontSize: '18px' }}>×</button>
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

        {/* 评论 */}
        <div className="mt-5" style={{ fontSize: '12px', color: 'var(--color-ink-faint)', marginBottom: '4px' }}>评论</div>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="写点什么…"
          className="font-serif"
          style={{ fieldSizing: 'content', width: '100%', minHeight: '44px', border: '1px solid var(--color-line)', borderRadius: '8px', background: 'var(--color-paper-2)', padding: '8px 10px', outline: 'none', resize: 'none', fontSize: '14px', color: 'var(--color-ink)', lineHeight: 1.7 } as React.CSSProperties}
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
      </div>
    </div>
  )
}
