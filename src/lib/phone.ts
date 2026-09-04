/**
 * Turning the shop's free-text phone field into a number WhatsApp can open.
 *
 * The legacy data is messy — real examples from the import:
 *   "012-7092932"              one clean mobile
 *   "011-37714755"             011 numbers carry an extra digit
 *   "2237772 / 016-7100143"    a landline and a mobile in one field
 *   "017-7889519/65-88935157"  a Malaysian and a Singapore number
 *   "9358 ::: 0127363972"      a ref number accidentally in the phone field
 *   "197791904"                digits that may or may not be a phone number
 *
 * The rule is deliberately strict: anything we cannot positively identify as a
 * Malaysian mobile returns null, and the UI then refuses to open a chat. Sending
 * a customer's name to a stranger is far worse than skipping a row.
 */

const digitsOnly = (s: string): string => s.replace(/\D/g, '')

/**
 * Accepts a digit string and returns international format (60...) if it is a
 * Malaysian mobile: 01X plus 8 or 9 more digits locally (010–019, where 011
 * numbers are one digit longer). Landlines and foreign numbers return null.
 */
function toMalaysianMobile(digits: string): string | null {
  let d = digits.replace(/^00/, '') // 00 international prefix
  if (d.startsWith('60')) d = '0' + d.slice(2) // 60127161609 -> 0127161609
  if (!/^01\d{8,9}$/.test(d)) return null
  return '6' + d // 0127161609 -> 60127161609
}

/**
 * Extracts the first usable Malaysian mobile from a free-text phone field.
 * Returns international digits with no punctuation, or null.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null

  // Try progressively finer splits: the whole field first (handles "012 716 1609"),
  // then chunks around separators like "/" and ":::", then whitespace-separated tokens.
  const candidates: string[] = []
  const add = (s: string) => {
    const d = digitsOnly(s)
    if (d) candidates.push(d)
  }
  add(raw)
  raw.split(/[^\d+\-\s]+/).forEach(add)
  raw.split(/\s+/).forEach(add)

  for (const candidate of candidates) {
    const number = toMalaysianMobile(candidate)
    if (number) return number
  }
  return null
}

/**
 * A wa.me link that opens a WhatsApp chat with this number. Nothing is sent —
 * it only opens the conversation, with optional text pre-typed for the staff
 * member to review and send themselves.
 */
export function buildWhatsAppUrl(number: string, message?: string): string {
  const base = `https://wa.me/${number}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

/** "60127161609" -> "+60 12-7161609", for showing which number will be used. */
export function formatWhatsAppNumber(number: string): string {
  const local = '0' + number.slice(2)
  return `+60 ${local.slice(1, 3)}-${local.slice(3)}`
}
