import { useId } from 'react'
import './Mascot.css'

// 保留原画质感，仅让分层部件运动；hop=false 用于静态分享图。
export function Mascot({ size = 46, hop = false, thinking = false }: { size?: number; hop?: boolean; thinking?: boolean }) {
  const id = useId().replace(/:/g, '')
  const original = `${import.meta.env.BASE_URL}mascot/wanwan.png`
  const body = `${import.meta.env.BASE_URL}mascot/wanwan-body.png`
  return (
    <span className={`wanwan${hop ? ' wanwan--alive' : ''}${thinking ? ' wanwan--thinking' : ''}`} style={{ width: size, height: size }}>
      {hop ? (
        <svg viewBox="0 0 1000 1000" width={size} height={size} role="img" aria-label={thinking ? '丸丸正在思考行程' : '丸丸向你打招呼'}>
          <defs>
            <clipPath id={`${id}-hand`}>
              <path d="M269 533 C248 510 246 457 216 443 C172 423 142 455 138 491 C132 548 160 606 205 630 L262 650 L308 596 Z" />
            </clipPath>
            <clipPath id={`${id}-left`}><ellipse cx="400" cy="442" rx="22" ry="26" /></clipPath>
            <clipPath id={`${id}-right`}><ellipse cx="627" cy="471" rx="21" ry="25" /></clipPath>
            <clipPath id={`${id}-mouth`}><rect x="476" y="455" width="65" height="36" rx="16" /></clipPath>
          </defs>
          <g className="wanwan-breathe">
            <g className="wanwan-tilt">
              <image href={body} width="1000" height="1000" />
              <g className="wanwan-hand">
                <image href={original} width="1000" height="1000" clipPath={`url(#${id}-hand)`} />
              </g>
              <g className="wanwan-face">
                <g className="wanwan-eye wanwan-eye--left"><image href={original} width="1000" height="1000" clipPath={`url(#${id}-left)`} /></g>
                <g className="wanwan-eye wanwan-eye--right"><image href={original} width="1000" height="1000" clipPath={`url(#${id}-right)`} /></g>
                <image href={original} width="1000" height="1000" clipPath={`url(#${id}-mouth)`} />
                <g className="wanwan-happy" fill="none" stroke="#885c40" strokeWidth="9" strokeLinecap="round">
                  <path d="M384 444 Q400 424 414 440" />
                  <path d="M613 470 Q628 451 642 469" />
                </g>
              </g>
            </g>
          </g>
        </svg>
      ) : <img src={original} width={size} height={size} alt="丸丸" />}
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

export function MascotThinking({ caption = '丸丸正在排…' }: { caption?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.75rem 0' }}>
      <div className="wm-stage" aria-hidden="true">
        <div className="wm-dots"><i /><i /><i /></div>
        <div className="wm-body">
          <Mascot size={88} hop thinking />
        </div>
      </div>
      <div className="font-serif" style={{ fontSize: '13.5px', color: 'var(--color-ink-soft)', letterSpacing: '0.12em', marginTop: '2px' }}>
        {caption}
      </div>
    </div>
  )
}
