import { useEffect, useState } from 'react'
import { getCheckin, saveCheckin } from '../lib/db'

export default function SpotDetail({ name, city, onClose }: { name: string; city: string; onClose: () => void }) {
  const spot = (city ? city + ' ' : '') + name
  const mapUrl = `https://uri.amap.com/search?keyword=${encodeURIComponent(spot)}`
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [checked, setChecked] = useState(false)
  const [photos, setPhotos] = useState<string[]>([]) // 本地预览（持久化待接 Supabase Storage）
  const [msg, setMsg] = useState('')

  useEffect(() => {
    getCheckin(spot)
      .then((c) => {
        if (c) {
          setRating(c.rating || 0)
          setReview(c.review || '')
          setChecked(!!c.checked_at)
        }
      })
      .catch(() => {})
  }, [spot])

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files || [])
    setPhotos((p) => [...p, ...fs.map((f) => URL.createObjectURL(f))])
    e.target.value = ''
  }

  const doCheckin = async () => {
    setMsg('')
    try {
      await saveCheckin({ spot, rating: rating || null, review: review.trim(), checked: true })
      setChecked(true)
      setMsg('打卡成功！')
    } catch (e) {
      const m = (e as Error).message
      setMsg(m.includes('checkins') || m.includes('schema cache') ? '打卡功能还没启用：先在 Supabase 跑 checkins 建表 SQL' : m)
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
            <img key={i} src={p} alt="" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px' }} />
          ))}
          <label style={{ width: '56px', height: '56px', borderRadius: '8px', border: '1px dashed var(--color-qing)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-qing)', fontSize: '20px', cursor: 'pointer' }}>
            ＋
            <input type="file" accept="image/*" multiple onChange={onPhoto} style={{ display: 'none' }} />
          </label>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-ink-faint)', marginTop: '6px' }}>照片当前为本地预览，云端存储待接 Supabase Storage</div>

        <button
          onClick={doCheckin}
          className="font-serif"
          style={{ width: '100%', marginTop: '20px', padding: '11px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: checked ? 'var(--color-qing)' : 'var(--color-seal)', color: '#F7F3EA', fontSize: '15px', letterSpacing: '0.08em' }}
        >
          {checked ? '✓ 已打卡（保存修改）' : '在这儿打卡'}
        </button>
        {msg && <div className="mt-2" style={{ fontSize: '12px', color: 'var(--color-qing)' }}>{msg}</div>}
      </div>
    </div>
  )
}
