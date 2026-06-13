// 古风彩色小图标（带颜色，非纯线条）。

// 铜钱（铜板）—— 账本
export function IcoCoin({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flex: '0 0 auto' }}>
      <circle cx="12" cy="12" r="9.5" fill="#D8A93B" stroke="#9A6B12" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="6.6" fill="none" stroke="#B07F1E" strokeWidth="1" opacity="0.6" />
      <rect x="9.2" y="9.2" width="5.6" height="5.6" rx="0.6" fill="#9A6B12" />
    </svg>
  )
}

// 卷轴 / 行程单
export function IcoScroll({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flex: '0 0 auto' }}>
      <rect x="7" y="5" width="10" height="14" rx="1.2" fill="#F3E7CB" stroke="#C9A06A" strokeWidth="1.3" />
      <path d="M9.5 9h5M9.5 12h5M9.5 15h3.2" stroke="#A9824A" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="5" y="3.4" width="14" height="3" rx="1.5" fill="#9A6B3A" />
      <rect x="5" y="17.6" width="14" height="3" rx="1.5" fill="#9A6B3A" />
    </svg>
  )
}

// 毛笔 / 编辑
export function IcoBrush({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M19 4l1 1-9 9-2-2 9-9z" fill="#3E7C86" />
      <path d="M9 12l3 3-4 1.5-1.5-.5 .5-1.5L9 12z" fill="#2B2924" />
      <path d="M6 17.5l1.5.5-.6 1.6c-.5 1-1.8 1.2-2 .2-.1-.7.5-1.5 1.1-2.3z" fill="#2B2924" />
    </svg>
  )
}
