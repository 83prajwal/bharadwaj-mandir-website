// Always-visible way to start a conversation. Uses the phone number already
// published in the footer and contact page. Remove this component from App.jsx
// if +91-9953836555 is not on WhatsApp.
const number = '919953836555'
const text = 'Namaste Bharadwaj Mandir, I would like to enquire about a marble mandir.'

export default function FloatingContact() {
  return (
    <a
      className="floating-contact"
      href={`https://wa.me/${number}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Bharadwaj Mandir on WhatsApp"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.5A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.2 15l-.3-.18-3.1.9.9-3-.2-.32a8.1 8.1 0 0 1 6.9-12.4Zm-3 3.9c-.2 0-.5.07-.75.35-.26.28-1 1-1 2.4s1.03 2.8 1.18 3c.14.2 2 3.2 4.9 4.35 2.4.95 2.9.76 3.4.7.52-.05 1.7-.7 1.94-1.37.24-.68.24-1.26.17-1.38-.07-.12-.26-.2-.55-.33-.28-.15-1.7-.84-1.96-.94-.26-.1-.45-.14-.64.14-.2.29-.74.94-.9 1.13-.17.2-.33.22-.62.07-.29-.14-1.2-.44-2.3-1.42-.85-.76-1.42-1.7-1.6-1.98-.16-.29-.02-.44.12-.58.13-.13.29-.33.43-.5.15-.17.2-.29.29-.48.1-.2.05-.37-.02-.5-.07-.15-.64-1.55-.88-2.12-.23-.55-.47-.48-.64-.49h-.55Z" />
      </svg>
      <span>Chat on WhatsApp</span>
    </a>
  )
}
