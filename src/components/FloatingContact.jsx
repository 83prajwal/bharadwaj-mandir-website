import WhatsAppLink from './WhatsAppLink'

export default function FloatingContact() {
  return (
    <div className="floating-stack">
      <div className="floating-action-wrapper">
        <span className="floating-tooltip" aria-hidden="true">WhatsApp</span>
        <WhatsAppLink className="floating-action floating-whatsapp" label="Chat with Bharadwaj Mandir on WhatsApp" iconSize={26} />
      </div>
    </div>
  )
}
