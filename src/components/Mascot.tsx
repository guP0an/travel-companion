// 原创吉祥物「丸玩」—— 一颗可爱的丸子（团子/麻薯），顶上冒青芽，
// 大眼带高光、朱砂腮红、右眼眼尾一颗泪痣。墨线 + 青 + 朱砂，融进宣纸水墨调性。
// 不使用任何受版权保护的角色形象。

export function Mascot({ size = 46, hop = false }: { size?: number; hop?: boolean }) {
  return (
    <span className={hop ? 'wm-hop' : undefined} style={{ display: 'inline-block', lineHeight: 0 }}>
    <svg viewBox="0 0 100 100" width={size} height={size} aria-label="丸玩">
      {/* 顶上小青芽 */}
      <path d="M50 23 V12" fill="none" stroke="var(--color-qing)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M50 15 q-8-4-11 2 q6 5 11 0 z" fill="var(--color-qing)" />
      <path d="M50 17 q8-4 11 2 q-6 5 -11 0 z" fill="var(--color-qing)" opacity="0.78" />
      {/* 丸子身体 */}
      <path
        d="M50 23 C 28 23, 17 39, 17 58 C 17 78, 33 90, 50 90 C 67 90, 83 78, 83 58 C 83 39, 72 23, 50 23 Z"
        fill="var(--color-paper-2)"
        stroke="var(--color-ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* 眼睛 + 高光 */}
      <ellipse cx="37" cy="55" rx="6" ry="7.4" fill="var(--color-ink)" />
      <ellipse cx="63" cy="55" rx="6" ry="7.4" fill="var(--color-ink)" />
      <circle cx="39.2" cy="51.6" r="2.1" fill="var(--color-paper-2)" />
      <circle cx="65.2" cy="51.6" r="2.1" fill="var(--color-paper-2)" />
      <circle cx="35.4" cy="57.6" r="1" fill="var(--color-paper-2)" opacity="0.8" />
      <circle cx="61.4" cy="57.6" r="1" fill="var(--color-paper-2)" opacity="0.8" />
      {/* 泪痣：右眼（你看过去的左侧）眼尾 */}
      <circle cx="29.5" cy="62" r="1.5" fill="var(--color-ink)" />
      {/* 腮红 */}
      <ellipse cx="26" cy="67" rx="5" ry="3" fill="var(--color-seal)" opacity="0.3" />
      <ellipse cx="74" cy="67" rx="5" ry="3" fill="var(--color-seal)" opacity="0.3" />
      {/* 微笑 */}
      <path d="M44 69 q6 5 12 0" fill="none" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
    </span>
  )
}

// 一串丸子（三色团子串），放在生成按钮里，卡通可爱
export function Dango({ width = 58 }: { width?: number }) {
  return (
    <svg viewBox="0 0 58 18" width={width} height={width * (18 / 58)} aria-hidden style={{ display: 'block' }}>
      <line x1="4" y1="9" x2="54" y2="9" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="9" r="6.2" fill="#FCFAF4" stroke="rgba(255,255,255,0.9)" strokeWidth="1.4" />
      <circle cx="30" cy="9" r="6.2" fill="#F6C9B0" stroke="rgba(255,255,255,0.9)" strokeWidth="1.4" />
      <circle cx="43" cy="9" r="6.2" fill="#BFDCDC" stroke="rgba(255,255,255,0.9)" strokeWidth="1.4" />
    </svg>
  )
}

export function MascotThinking({ caption = '丸玩正在排…' }: { caption?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.75rem 0' }}>
      <style>{`
        @keyframes wm-bob { 0%,100%{ transform: translateY(0) rotate(-3deg) } 50%{ transform: translateY(-7px) rotate(3deg) } }
        @keyframes wm-dot { 0%,70%,100%{ opacity:.2; transform: translateY(3px) scale(.8) } 35%{ opacity:1; transform: translateY(0) scale(1) } }
        .wm-stage{ position:relative; width:150px; height:110px }
        .wm-body{ position:absolute; left:48px; top:16px }
        .wm-dots{ position:absolute; right:14px; top:0; display:flex; align-items:flex-end; gap:7px }
        .wm-dots i{ border-radius:50%; background:var(--color-qing); display:block; animation: wm-dot 1.4s ease-in-out infinite }
        .wm-dots i:nth-child(1){ width:7px; height:7px }
        .wm-dots i:nth-child(2){ width:9px; height:9px; animation-delay:.2s }
        .wm-dots i:nth-child(3){ width:11px; height:11px; animation-delay:.4s }
      `}</style>
      <div className="wm-stage">
        <div className="wm-dots"><i /><i /><i /></div>
        <div className="wm-body">
          <Mascot size={62} hop />
        </div>
      </div>
      <div className="font-serif" style={{ fontSize: '13.5px', color: 'var(--color-ink-soft)', letterSpacing: '0.12em', marginTop: '2px' }}>
        {caption}
      </div>
    </div>
  )
}
