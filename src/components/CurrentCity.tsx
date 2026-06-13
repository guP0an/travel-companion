import { useEffect, useState } from 'react'

// 显示「你现在在 X」。浏览器定位 → 免 key 反查城市(bigdatacloud)。不支持手动改。
export default function CurrentCity() {
  const [city, setCity] = useState<string | null>(() => localStorage.getItem('ww_city'))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (city) localStorage.setItem('ww_city', city)
  }, [city])

  const locate = () => {
    if (!navigator.geolocation) return
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: la, longitude: lo } = pos.coords
          const r = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${la}&longitude=${lo}&localityLanguage=zh`,
          )
          const d = await r.json()
          setCity(d.city || d.locality || d.principalSubdivision || null)
        } catch {
          /* ignore */
        } finally {
          setBusy(false)
        }
      },
      () => setBusy(false),
      { timeout: 8000 },
    )
  }

  return (
    <div className="mb-6" style={{ fontSize: '12.5px', color: 'var(--color-ink-soft)', display: 'flex', alignItems: 'center', gap: '5px' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--color-qing)" aria-hidden style={{ flex: '0 0 auto' }}>
        <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
      </svg>
      {busy ? (
        '定位中…'
      ) : city ? (
        <span style={{ color: 'var(--color-ink)' }}>{city}</span>
      ) : (
        <button onClick={locate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-qing)', fontSize: '12.5px', padding: 0 }}>
          定位我在哪
        </button>
      )}
    </div>
  )
}
