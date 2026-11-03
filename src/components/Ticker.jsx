// A slow ticker built only from details already published on the site
// (the product feature lists and the custom enquiry flow). It makes no new claims.
const words = [
  'Ornate carved arches',
  'Decorated side pillars',
  'Lattice side panels',
  'Drawer-front bases',
  'Peacock motifs',
  'Floral carving',
  'Made around your space',
  'Custom size enquiries',
]

export default function Ticker() {
  const row = (hidden) => (
    <ul className="ticker-row" aria-hidden={hidden || undefined}>
      {words.map((word) => <li key={word}>{word}</li>)}
    </ul>
  )
  return (
    <div className="ticker" role="presentation">
      <div className="ticker-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}
