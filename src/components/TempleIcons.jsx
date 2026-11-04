// Small line icons drawn for this site. All are decorative (aria-hidden);
// the surrounding text always names what the icon represents.
const paths = {
  temple: <><path d="M12 2v2M9 7l3-3 3 3" /><path d="M7 11h10l-2-4H9l-2 4Z" /><path d="M5 21V11h14v10" /><path d="M3 21h18M10 21v-5a2 2 0 0 1 4 0v5" /></>,
  bell: <><path d="M12 2v2" /><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4l2-2Z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  bellOff: <><path d="M12 2v2" /><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4l2-2Z" /><path d="M10 21a2 2 0 0 0 4 0" /><path d="m3 3 18 18" /></>,
  phone: <path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" />,
  arrowUp: <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>,
  map: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" /></>,
  facebook: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v7h4v-7h3l1-4h-4V8Z" />,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3V9Z" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6" /></>,
}

export default function TempleIcon({ name, className = 'temple-icon', size = 24 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name] || null}
    </svg>
  )
}
