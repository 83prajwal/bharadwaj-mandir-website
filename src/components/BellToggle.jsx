import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import TempleIcon from './TempleIcons'

const STORAGE_KEY = 'bm-bell-sound'

function readPreference() {
  try { return localStorage.getItem(STORAGE_KEY) === 'on' } catch { return false }
}

function savePreference(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off') } catch { /* storage unavailable */ }
}

// A soft temple-bell chime synthesised with Web Audio (no audio file to load).
function ring(context) {
  const now = context.currentTime
  const master = context.createGain()
  master.gain.value = 0.16
  master.connect(context.destination)
  // Inharmonic partials give the metallic bell character.
  ;[[523, 1], [1046, 0.5], [1307, 0.32], [1752, 0.22], [2380, 0.12]].forEach(([freq, level], i) => {
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(level, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.6 - i * 0.45)
    osc.connect(gain).connect(master)
    osc.start(now)
    osc.stop(now + 3.8)
  })
}

// Optional bell sound, off by default. When on, it chimes once when switched
// on and softly on each page change.
export default function BellToggle() {
  const [on, setOn] = useState(readPreference)
  const contextRef = useRef(null)
  const { pathname } = useLocation()
  const firstPath = useRef(true)

  function chime() {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    if (!contextRef.current) contextRef.current = new AudioContext()
    const context = contextRef.current
    if (context.state === 'suspended') context.resume()
    ring(context)
  }

  useEffect(() => {
    if (firstPath.current) { firstPath.current = false; return }
    // Browsers only allow sound after the visitor has interacted, which a
    // page change via a link always is.
    if (on && contextRef.current) chime()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    const next = !on
    setOn(next)
    savePreference(next)
    if (next) chime()
  }

  return (
    <button type="button" className={`bell-toggle ${on ? 'is-on' : ''}`} onClick={toggle} aria-pressed={on} aria-label={on ? 'Turn temple bell sound off' : 'Turn temple bell sound on'} title={on ? 'Bell sound on' : 'Bell sound off'}>
      <TempleIcon name={on ? 'bell' : 'bellOff'} size={20} />
    </button>
  )
}
