// Change the WhatsApp and Call number here. Country code first, digits only.
export const WHATSAPP_NUMBER = '919953836555'

export const WHATSAPP_DEFAULT_MESSAGE = 'Hello Bharadwaj Mandir, I would like to enquire about a mandir.'

export const callUrl = `tel:+${WHATSAPP_NUMBER}`

export function whatsappUrl(message = WHATSAPP_DEFAULT_MESSAGE) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

export function designWhatsappMessage(index, name) {
  return `Hi, I’m interested in Design ${String(index + 1).padStart(2, '0')}: ${name}.`
}
