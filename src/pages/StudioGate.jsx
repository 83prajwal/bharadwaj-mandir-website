import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getUser, login, logout, onAuthChange, requestPasswordRecovery, updateUser } from '@netlify/identity'
import WhatsAppLink from '../components/WhatsAppLink'
import { postStudioLead } from '../lib/studioLead'
import { defaults } from './mandir-studio/lib/config.ts'
import './studio-public.css'

// Keep the editable studio code behind authentication while sharing its real viewer publicly.
const MandirDesigner = lazy(() => import('./MandirDesigner.jsx'))
const MandirViewer = lazy(() => import('./mandir-studio/components/MandirViewer.tsx'))

const CONFIRM_EMAIL = 'Please check your email and click the confirmation link, then log in here.'

function WhatsAppFallback({ children }) {
  return (
    <div className="form-error studio-gate-fallback" role="alert">
      <p>{children}</p>
      <WhatsAppLink className="btn btn-whatsapp" label="Message Bharadwaj Mandir" iconSize={20}><span>Message us on WhatsApp</span></WhatsAppLink>
    </div>
  )
}

const studioFeatures = [
  { title: 'A design shaped around your home', text: 'Explore the form and architecture of a mandir made for your space.', icon: <><path d="M5 19V9l7-5 7 5v10H5Z"/><path d="M9 19v-6h6v6M3 9l9-7 9 7"/><path d="M10 9h4"/></> },
  { title: 'Dimensions that feel considered', text: 'Preview how a customised mandir could fit into your home using your preferred dimensions.', icon: <><path d="M4 7h16v10H4z"/><path d="M8 7v3m4-3v2m4-2v3M8 17v-3m4 3v-2m4 2v-3"/><path d="M2 12h2m16 0h2"/></> },
  { title: 'Marble, finish and detail', text: 'Explore marble finishes, carvings and design details before requesting your personalised design.', icon: <><path d="M4 5h16v14H4z"/><path d="m6 15 4-5 3 3 2-2 3 4M7 8h.01"/><path d="M8 3v2m8-2v2"/></> },
  { title: 'Personal touches, beautifully made', text: 'Consider carving and ornament details that bring your vision to life.', icon: <><path d="M12 3v18M3 12h18"/><path d="m12 3 3 5-3 4-3-4 3-5Zm0 9 5 3-5 3-5-3 5-3Z"/><circle cx="12" cy="12" r="8"/></> },
  { title: 'A clear path to your design', text: 'Share your brief with our team and begin a conversation about your custom mandir.', icon: <><path d="M4 5h10v14H4z"/><path d="M7 9h4m-4 3h4m-4 3h2"/><path d="M14 12h6m-3-3 3 3-3 3"/></> },
]

function PublicStudioPreview() {
  return (
    <>
      <section className="studio-public-hero" aria-labelledby="studio-public-title">
        <div className="container studio-hero-container">
          <div className="studio-public-copy">
            <p className="eyebrow">Bharadwaj Mandir · 3D Studio</p>
            <h1 id="studio-public-title">A sacred space,<br />imagined by you.</h1>
            <p className="studio-public-lede">Discover the craft of a custom marble mandir. Explore a true-to-design 3D preview, then share your vision with our team.</p>
            <div className="button-row">
              <Link to="/contact?interest=Custom%20mandir" className="btn btn-primary">Request a Custom Design <span aria-hidden="true">→</span></Link>
              <a className="btn btn-secondary" href="#studio-features">Explore the possibilities <span aria-hidden="true">↓</span></a>
            </div>
            <p className="field-help" style={{ marginTop: '1.25rem' }}>A first look is open to everyone. Create an account when you are ready to design.</p>
          </div>
          <div className="studio-public-model-wrap" aria-label="Interactive sample marble mandir model">
            <div className="studio-public-orbit studio-orbit-one" aria-hidden="true" />
            <div className="studio-public-orbit studio-orbit-two" aria-hidden="true" />
            <div className="studio-public-model-label"><span>01 / SAMPLE STUDY</span><span>HERITAGE · WHITE MARBLE</span></div>
            <Suspense fallback={<div className="studio-public-viewer-loading" role="status">Preparing the sample mandir…</div>}>
              <MandirViewer config={{ ...defaults, designFamily: 'Parametric', dimensions: false, doors: 'None', lighting: 'Top' }} compact autoRotate />
            </Suspense>
            <p className="studio-public-model-caption">A real-time 3D study · Drag to explore</p>
          </div>
        </div>
      </section>
      <section className="studio-public-intro" id="studio-features" aria-labelledby="studio-features-title">
        <div className="container">
          <div className="studio-features-heading-stacked">
            <h2 id="studio-features-title">From first thought to a place of devotion.</h2>
            <p className="eyebrow">Your vision, in three dimensions</p>
          </div>
          <div className="studio-feature-grid">
            {studioFeatures.map((feature, index) => (
              <article className="studio-feature-card" key={feature.title} style={{ '--feature-index': index }}>
                <svg viewBox="0 0 24 24" role="img" aria-label={feature.title} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">{feature.icon}</svg>
                <span className="studio-feature-number">0{index + 1}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
          <div className="button-row center" style={{ marginTop: '2.5rem' }}>
            <p style={{ width: '100%', textAlign: 'center', color: 'var(--muted)', margin: '0 0 .5rem' }}>When you are ready, let us help bring your idea to life.</p>
            <Link to="/contact?interest=Custom%20mandir" className="btn btn-primary">Request a Custom Design <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>
    </>
  )
}

function SetPasswordForm({ onDone }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await updateUser({ password })
      onDone()
    } catch {
      setError('Your password could not be changed. Please request a new reset link.')
      setBusy(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="section-shell container studio-gate">
        <div className="enquiry-box studio-gate-box">
          <h1>Choose a new password</h1>
          <form className="enquiry-form" onSubmit={submit}>
            <label><span>New password</span><input type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
          </form>
        </div>
      </section>
    </main>
  )
}

function AuthForms({ initialNotice, onSignedUp }) {
  const [mode, setMode] = useState('signup')
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '', website: '', consent: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fallback, setFallback] = useState('')
  const [notice, setNotice] = useState(initialNotice)

  const field = (name) => ({ name, value: form[name], onChange: (event) => setForm((current) => ({ ...current, [name]: event.target.value })) })

  function changeMode(next) {
    setMode(next)
    setError('')
    setFallback('')
    setNotice('')
  }

  async function submitSignup() {
    let result
    try {
      result = await postStudioLead({ action: 'signup', ...form })
    } catch (failure) {
      if (failure.status === 400 || failure.status === 409 || failure.status === 429) setError(failure.message)
      else setFallback('We could not create your account just now. Please try again in a moment, or message us and we will help you.')
      return
    }
    const saveProblem = result.saved ? '' : 'Your account was created, but we could not save your details for the team. Please message us so we can follow up.'
    if (result.confirmationRequired) {
      setMode('login')
      setNotice(`Thank you, your account has been created. ${CONFIRM_EMAIL}`)
      setFallback(saveProblem)
      return
    }
    onSignedUp(saveProblem)
    await login(form.email.trim(), form.password)
  }

  async function submitLogin() {
    try {
      await login(form.email.trim(), form.password)
    } catch (failure) {
      setError(/confirm/i.test(failure.message || '') ? CONFIRM_EMAIL : 'That email or password is not correct.')
    }
  }

  async function submitForgot() {
    try {
      await requestPasswordRecovery(form.email.trim())
    } catch { /* The same message is shown either way, so accounts cannot be probed. */ }
    setNotice('If that email has an account, a password reset link is on its way.')
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setFallback('')
    setNotice('')
    try {
      await { signup: submitSignup, login: submitLogin, forgot: submitForgot }[mode]()
    } catch {
      setFallback('Something went wrong. Please try again, or message us and we will help you.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="studio-signup" id="studio-signup" aria-labelledby="studio-signup-title">
      <div className="container studio-gate">
        <div className="studio-gate-intro">
          <p className="eyebrow">Bharadwaj Mandir · 3D Studio</p>
          <h2 id="studio-signup-title">Create a free account to design your own mandir in 3D.</h2>
          <p>Adjust the size, marble and carving, then request a quotation for your design.</p>
        </div>
        <div className="enquiry-box studio-gate-box">
          {mode !== 'forgot' ? (
            <div className="studio-gate-tabs" role="group" aria-label="Sign up or log in">
              <button type="button" aria-pressed={mode === 'signup'} onClick={() => changeMode('signup')}>Sign up</button>
              <button type="button" aria-pressed={mode === 'login'} onClick={() => changeMode('login')}>Log in</button>
            </div>
          ) : <h2>Reset your password</h2>}
          {notice ? <p className="studio-gate-notice" role="status">{notice}</p> : null}
          <form className="enquiry-form" onSubmit={submit}>
            {mode === 'signup' ? (
              <>
                <label><span>Full name *</span><input type="text" autoComplete="name" minLength={2} maxLength={120} required {...field('fullName')} /></label>
                <label><span>Phone *</span><input type="tel" autoComplete="tel" pattern="(\+?91|0)?[\s\-]*[6-9][\d\s\-]{9,13}" title="Enter a 10-digit Indian mobile number. Country code is optional." required {...field('phone')} /></label>
              </>
            ) : null}
            <label><span>Email *</span><input type="email" autoComplete="email" maxLength={254} required {...field('email')} /></label>
            {mode !== 'forgot' ? <label><span>Password *</span><input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} maxLength={72} required {...field('password')} /></label> : null}
            {mode === 'signup' ? (
              <>
                <label className="honeypot" aria-hidden="true">Leave this empty<input tabIndex="-1" autoComplete="off" {...field('website')} /></label>
                <label className="studio-consent"><input type="checkbox" required checked={form.consent} onChange={(event) => setForm((current) => ({ ...current, consent: event.target.checked }))} /><span>I agree to be contacted by Bharadwaj Mandir about my design. *</span></label>
                <p className="field-help">See our <Link to="/privacy">privacy notice</Link>.</p>
              </>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {fallback ? <WhatsAppFallback>{fallback}</WhatsAppFallback> : null}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Please wait…' : { signup: 'Create free account', login: 'Log in', forgot: 'Send reset link' }[mode]}
            </button>
          </form>
          {mode === 'login' ? <button type="button" className="studio-gate-link" onClick={() => changeMode('forgot')}>Forgot your password?</button> : null}
          {mode === 'forgot' ? <button type="button" className="studio-gate-link" onClick={() => changeMode('login')}>Back to log in</button> : null}
        </div>
      </div>
    </section>
  )
}

export default function StudioGate() {
  const location = useLocation()
  const [user, setUser] = useState(undefined)
  const [mustSetPassword, setMustSetPassword] = useState(Boolean(location.state?.setPassword))
  const [saveProblem, setSaveProblem] = useState('')
  const [welcome, setWelcome] = useState('')

  useEffect(() => {
    let active = true
    getUser().then((current) => { if (active) setUser(current) }).catch(() => { if (active) setUser(null) })
    const stopListening = onAuthChange((_event, current) => { if (active) setUser(current || null) })
    return () => {
      active = false
      stopListening()
    }
  }, [])

  if (user === undefined) return <main className="page-shell designer-route-loading" aria-live="polite">Opening the 3D studio…</main>
  if (!user) {
    const notice = location.state?.authLinkFailed ? 'That link has expired or was already used. Please log in, or request a new one.' : location.state?.confirmed ? 'Your email is confirmed. Please log in.' : ''
    return (
      <main className="page-shell studio-public">
        <PublicStudioPreview />
        <AuthForms initialNotice={notice} onSignedUp={(problem) => { setSaveProblem(problem); setWelcome('Your account is ready. Welcome to the 3D Studio.') }} />
      </main>
    )
  }
  if (mustSetPassword) return <SetPasswordForm onDone={() => setMustSetPassword(false)} />

  return (
    <>
      <div className="studio-account-bar">
        <span role="status">{welcome || `Signed in as ${user.email}`}</span>
        <button type="button" onClick={() => logout().catch(() => setUser(null))}>Log out</button>
      </div>
      {saveProblem ? <div className="container"><WhatsAppFallback>{saveProblem}</WhatsAppFallback></div> : null}
      <Suspense fallback={<main className="page-shell designer-route-loading" aria-live="polite">Opening the 3D studio…</main>}><MandirDesigner /></Suspense>
    </>
  )
}
