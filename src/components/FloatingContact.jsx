import TempleIcon from './TempleIcons'
import WhatsAppLink from './WhatsAppLink'
import { callUrl } from '../config/contact'

export default function FloatingContact() {
  return (
    <div className="floating-stack">
      <a className="floating-action floating-call" href={callUrl} aria-label="Call Bharadwaj Mandir">
        <TempleIcon name="phone" size={22} />
      </a>
      <WhatsAppLink className="floating-action floating-whatsapp" label="Chat with Bharadwaj Mandir on WhatsApp" iconSize={26} />
    </div>
  )
}
