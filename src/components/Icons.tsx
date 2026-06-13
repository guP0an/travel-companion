// 古风线条小图标，颜色随父级 currentColor。
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

// 卷轴 / 行程单
export function IcoScroll({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden style={{ flex: '0 0 auto' }}>
      <rect x="6" y="4" width="12" height="16" rx="1.5" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  )
}

// 铜钱（圆+方孔）—— 账本
export function IcoCoin({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden style={{ flex: '0 0 auto' }}>
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" />
    </svg>
  )
}

// 毛笔 / 编辑
export function IcoBrush({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M5 19l3.5-1L18 8.5 15.5 6 6 15.5 5 19z" />
      <path d="M14 7.5l2.5 2.5" />
    </svg>
  )
}
