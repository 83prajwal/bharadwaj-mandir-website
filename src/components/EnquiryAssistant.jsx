import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { readAssistantResponse } from '../lib/assistant-response'
import {
  acquireAssistantSubmission,
  getValidAssistantQuestion,
  releaseAssistantSubmission,
} from '../lib/assistant-input'

const greeting = {
  role: 'assistant',
  content: 'Hello. I can help with the designs and information published on this website. For exact specifications, pricing or destination availability, the team will need to confirm your project.',
}

export default function EnquiryAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([greeting])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [handoff, setHandoff] = useState(false)
  const transcriptRef = useRef(null)
  const launcherRef = useRef(null)
  const composerRef = useRef(null)
  const submissionLockRef = useRef(false)

  useEffect(() => {
    if (open) {
      composerRef.current?.focus()
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
    } else launcherRef.current?.focus()
  }, [messages, open])

  async function sendMessage(event) {
    event.preventDefault()
    const content = getValidAssistantQuestion(draft)
    if (!content || busy || !acquireAssistantSubmission(submissionLockRef)) return
    const nextMessages = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setDraft('')
    setError('')
    setHandoff(false)
    setBusy(true)
    try {
      const recentMessages = []
      let recentLength = 0
      for (const message of nextMessages.slice(-8).reverse()) {
        if (recentLength + message.content.length > 4000) break
        recentMessages.unshift(message)
        recentLength += message.content.length
      }
      const response = await fetch('/.netlify/functions/ai-assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: recentMessages.map(({ role, content: text }) => ({ role, content: text })) }),
      })
      const data = await readAssistantResponse(response)
      setMessages((current) => [...current, { role: 'assistant', content: data.answer }])
      setHandoff(data.handoff === true)
    } catch (sendError) {
      if (sendError?.code === 'ASSISTANT_ENDPOINT_UNAVAILABLE') {
        const isLocalPreview = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
        setError(isLocalPreview
          ? 'The local assistant endpoint is unavailable. Check that Netlify Dev and its Functions process are running, then try again.'
          : 'The assistant service returned an unreadable response. Please try again or continue with the enquiry form.')
      } else {
        setError(sendError instanceof Error ? sendError.message : 'The assistant is temporarily unavailable.')
      }
    } finally {
      releaseAssistantSubmission(submissionLockRef)
      setBusy(false)
    }
  }

  return (
    <div className="assistant-widget">
      {open && (
        <section className="assistant-panel" id="assistant-widget-panel" aria-labelledby="assistant-title">
          <header className="assistant-header">
            <div><p className="assistant-eyebrow">Bharadwaj Mandir</p><h2 id="assistant-title">Product enquiry assistant</h2></div>
            <button type="button" className="assistant-close" onClick={() => setOpen(false)} aria-label="Close assistant">×</button>
          </header>
          <p className="assistant-privacy">Answers use published product, FAQ and delivery information. Please don’t share payment details or sensitive personal information here. Messages are sent to our AI provider to prepare a response. For project details, use our <Link to="/privacy">privacy notice</Link>.</p>
          <div className="assistant-transcript" ref={transcriptRef} role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation">
            {messages.map((message, index) => (
              <p className={`assistant-message assistant-message-${message.role}`} key={`${index}-${message.role}`}>{message.content}</p>
            ))}
            {busy && <p className="assistant-message assistant-message-assistant" role="status">Checking the published information…</p>}
          </div>
          {handoff && <Link className="assistant-handoff" to="/contact?interest=Project%20enquiry" state={{ assistantQuestion: messages.filter((message) => message.role === 'user').at(-1)?.content || '' }}>Continue with the existing enquiry form</Link>}
          {error && <div className="assistant-error" role="alert"><p>{error}</p><Link to="/contact?interest=Project%20enquiry" state={{ assistantQuestion: messages.filter((message) => message.role === 'user').at(-1)?.content || '' }}>Continue with the enquiry form</Link></div>}
          <form className="assistant-composer" onSubmit={sendMessage}>
            <label className="assistant-sr-only" htmlFor="assistant-message">Ask a question about our mandirs</label>
            <textarea ref={composerRef} id="assistant-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1200} rows={2} placeholder="Ask about designs, enquiries or delivery" disabled={busy} />
            <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>Send</button>
          </form>
          <p className="assistant-limit">Up to 1,200 characters. The team confirms project specifications and availability.</p>
        </section>
      )}
      <button ref={launcherRef} className="assistant-launcher" type="button" aria-expanded={open} aria-controls="assistant-widget-panel" onClick={() => setOpen((value) => !value)}>
        {!open && <svg className="assistant-launcher-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5a7.5 7.5 0 1 1 17-3Z" /></svg>}
        {open ? 'Close assistant' : 'Ask us'}
      </button>
    </div>
  )
}
