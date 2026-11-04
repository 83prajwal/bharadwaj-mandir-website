// Decorative SVG artwork: section dividers, mandala, diyas and petals.
// Everything here is aria-hidden and purely visual.

function GopuramDivider() {
  // Repeating temple-tower silhouettes along the edge of a section.
  return (
    <svg viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="gopuram-tile" width="160" height="90" patternUnits="userSpaceOnUse" fill="currentColor">
          <path d="M0 90V78h18V66h10V56h8V44h6V34h6V22h6V12h6V4h4v8h6v10h6v12h6v10h6v12h8v10h10v12h18v12H0Z" />
          <path d="M124 90V82h8V76h6V70h4v6h6v6h8v8Z" />
        </pattern>
      </defs>
      <rect width="1440" height="90" fill="url(#gopuram-tile)" />
    </svg>
  )
}

function LotusDivider() {
  return (
    <svg viewBox="0 0 320 40" aria-hidden="true" focusable="false">
      <path d="M0 20h118M202 20h118" stroke="currentColor" strokeWidth="1" />
      <circle cx="112" cy="20" r="2.5" fill="currentColor" />
      <circle cx="208" cy="20" r="2.5" fill="currentColor" />
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M160 4c7 7 7 19 0 28-7-9-7-21 0-28Z" />
        <path d="M160 32c-3-11-11-17-22-17 2 10 10 17 22 17Z" />
        <path d="M160 32c3-11 11-17 22-17-2 10-10 17-22 17Z" />
        <path d="M160 33c-10-1-19 2-26 6M160 33c10-1 19 2 26 6" />
      </g>
    </svg>
  )
}

function RangoliDivider() {
  return (
    <svg viewBox="0 0 480 36" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M0 18h170M310 18h170" strokeDasharray="2 6" />
        <path d="M240 2l16 16-16 16-16-16Z" />
        <path d="M240 8l10 10-10 10-10-10Z" />
        <path d="M200 18l12-8 12 8-12 8ZM256 18l12-8 12 8-12 8Z" />
        <circle cx="240" cy="18" r="2.4" fill="currentColor" />
      </g>
    </svg>
  )
}

export function Divider({ variant = 'lotus', className = '' }) {
  const art = variant === 'gopuram' ? <GopuramDivider /> : variant === 'rangoli' ? <RangoliDivider /> : <LotusDivider />
  return <div className={`divider divider-${variant} ${className}`} aria-hidden="true">{art}</div>
}

export function Mandala({ className = '' }) {
  const petals = Array.from({ length: 16 }, (_, i) => i * 22.5)
  const inner = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <svg className={`mandala ${className}`} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth=".8">
        <circle cx="100" cy="100" r="96" />
        <circle cx="100" cy="100" r="88" strokeDasharray="1 4" />
        {petals.map((a) => <path key={a} d="M100 14c10 16 10 34 0 48-10-14-10-32 0-48Z" transform={`rotate(${a} 100 100)`} />)}
        <circle cx="100" cy="100" r="40" />
        {inner.map((a) => <path key={a} d="M100 62c7 9 7 20 0 28-7-8-7-19 0-28Z" transform={`rotate(${a} 100 100)`} />)}
        <circle cx="100" cy="100" r="10" />
      </g>
    </svg>
  )
}

export function Diya({ className = '' }) {
  return (
    <svg className={`diya ${className}`} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="diya-glow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#FFE9A8" stopOpacity=".9" />
          <stop offset="100%" stopColor="#E8731A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="diya-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF4C2" />
          <stop offset="55%" stopColor="#F6B93B" />
          <stop offset="100%" stopColor="#E8731A" />
        </linearGradient>
        <linearGradient id="diya-bowl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4A017" />
          <stop offset="100%" stopColor="#9A5B12" />
        </linearGradient>
      </defs>
      <circle className="diya-glow" cx="32" cy="24" r="20" fill="url(#diya-glow)" />
      <path className="diya-flame" d="M32 8c5 7 6 11 6 14a6 6 0 0 1-12 0c0-3 1-7 6-14Z" fill="url(#diya-flame)" />
      <path d="M8 38h48c-3 10-13 16-24 16S11 48 8 38Z" fill="url(#diya-bowl)" />
      <path d="M8 38c6 3 14 4 24 4s18-1 24-4" fill="none" stroke="#FFF1C9" strokeOpacity=".5" />
    </svg>
  )
}

export function Petals({ count = 14 }) {
  // Deterministic layout so server-rendered and client markup always match.
  const items = Array.from({ length: count }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i * 1.7) % 12,
    duration: 11 + ((i * 5) % 9),
    size: 10 + ((i * 7) % 10),
    hue: i % 3,
  }))
  return (
    <div className="petals" aria-hidden="true">
      {items.map((p, i) => (
        <span
          key={i}
          className={`petal petal-${p.hue}`}
          style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, width: p.size, height: p.size * 0.8 }}
        />
      ))}
    </div>
  )
}
