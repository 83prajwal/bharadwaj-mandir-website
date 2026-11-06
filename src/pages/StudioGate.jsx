import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getUser, login, logout, onAuthChange, requestPasswordRecovery, updateUser } from '@netlify/identity'
import WhatsAppLink from '../components/WhatsAppLink'
import { postStudioLead } from '../lib/studioLead'

// The 3D code is a separate download that only starts after login.
const MandirDesigner = lazy(() => import('./MandirDesigner.jsx'))

const CONFIRM_EMAIL = 'Please check your email and click the confirmation link, then log in here.'

function WhatsAppFallback({ children }) {
  return (
    <div className="form-error studio-gate-fallback" role="alert">
      <p>{children}</p>
      <WhatsAppLink className="btn btn-whatsapp" label="Message Bharadwaj Mandir" iconSize={20}><span>Message us on WhatsApp</span></WhatsAppLink>
    </div>
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
    <main className="page-shell">
      <section className="section-shell container studio-gate">
        <div className="studio-gate-intro">
          <p className="eyebrow">Bharadwaj Mandir · 3D Studio</p>
          <h1>Create a free account to design your own mandir in 3D.</h1>
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
                <label><span>Phone *</span><input type="tel" autoComplete="tel" placeholder="98765 43210" pattern="(\+?91|0)?[\s\-]*[6-9][\d\s\-]{9,13}" title="Enter a 10-digit Indian mobile number. Country code is optional." required {...field('phone')} /></label>
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
      </section>
    </main>
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
    return <AuthForms initialNotice={notice} onSignedUp={(problem) => { setSaveProblem(problem); setWelcome('Your account is ready. Welcome to the 3D Studio.') }} />
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
