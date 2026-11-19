import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { readAssistantResponse } from '../lib/assistant-response'
import { openAssistantEvent } from '../lib/siteEvents'
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
  const [quotationHandoff, setQuotationHandoff] = useState(false)
  const transcriptRef = useRef(null)
  const openerRef = useRef(null)
  const composerRef = useRef(null)
  const submissionLockRef = useRef(false)

  useEffect(() => {
    if (open) {
      composerRef.current?.focus()
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
    } else if (openerRef.current) {
      openerRef.current.focus()
      openerRef.current = null
    }
  }, [messages, open])

  useEffect(() => {
    function openPanel() {
      openerRef.current = document.activeElement
      setOpen(true)
    }
    window.addEventListener(openAssistantEvent, openPanel)
    return () => window.removeEventListener(openAssistantEvent, openPanel)
  }, [])

  async function sendMessage(event) {
    event.preventDefault()
    const content = getValidAssistantQuestion(draft)
    if (!content || busy || !acquireAssistantSubmission(submissionLockRef)) return
    const nextMessages = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setDraft('')
    setError('')
    setHandoff(false)
    setQuotationHandoff(false)
    setBusy(true)
    try {
      const recentMessages = []
      let recentLength = 0
      for (const message of nextMessages.slice(-8).reverse()) {
        if (recentLength + message.content.length > 4000) break
        recentMessages.unshift(message)
        recentLength += message.content.length
      }
      const response = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: recentMessages.map(({ role, content: text }) => ({ role, content: text })) }),
      })
      const data = await readAssistantResponse(response)
      setMessages((current) => [...current, { role: 'assistant', content: data.answer }])
      setHandoff(data.handoff === true)
      setQuotationHandoff(data.quoteRequest === true)
    } catch (sendError) {
      if (sendError?.code === 'ASSISTANT_ENDPOINT_UNAVAILABLE') {
        const isLocalPreview = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
        setError(isLocalPreview
          ? 'The local assistant endpoint is unavailable. Check that Netlify Dev and its Functions process are running, then try again.'
          : sendError.message)
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
          {handoff && <Link className="assistant-handoff" to="/contact?interest=Project%20enquiry" state={{ assistantQuestion: messages.filter((message) => message.role === 'user').at(-1)?.content || '', assistantConversation: messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n').slice(-3000), assistantQuotationRequest: quotationHandoff }}>Continue with the existing enquiry form</Link>}
          {error && <div className="assistant-error" role="alert"><p>{error}</p><Link to="/contact?interest=Project%20enquiry" state={{ assistantQuestion: messages.filter((message) => message.role === 'user').at(-1)?.content || '' }}>Continue with the enquiry form</Link></div>}
          <form className="assistant-composer" onSubmit={sendMessage}>
            <label className="assistant-sr-only" htmlFor="assistant-message">Ask a question about our mandirs</label>
            <textarea ref={composerRef} id="assistant-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1200} rows={2} placeholder="Ask about designs, enquiries or delivery" disabled={busy} />
            <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>Send</button>
          </form>
          <p className="assistant-limit">Up to 1,200 characters. The team confirms project specifications and availability.</p>
        </section>
      )}
      <button
        className="assistant-launcher"
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Close product enquiry assistant' : 'Ask our product enquiry assistant'}
        aria-controls="assistant-widget-panel"
        onClick={() => {
          if (!open) openerRef.current = document.activeElement
          setOpen((value) => !value)
        }}
      >
        <span className="floating-tooltip" aria-hidden="true">{open ? 'Close assistant' : 'Ask us'}</span>
        {open ? (
          <span className="assistant-launcher-close-icon" aria-hidden="true">×</span>
        ) : (
          <svg className="assistant-launcher-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.03 2 11c0 2.87 1.5 5.42 3.84 7.07-.15.8-.62 2.33-1.63 3.32-.23.23-.05.61.27.61 2.14 0 4.1-1.07 5.16-1.83.76.15 1.55.23 2.36.23 5.52 0 10-4.03 10-9s-4.48-9-10-9Zm-3.5 10c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5Zm3.5 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5Zm3.5 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5Z" />
          </svg>
        )}
      </button>
    </div>
  )
}
