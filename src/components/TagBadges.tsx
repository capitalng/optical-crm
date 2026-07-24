import { TAG_LABELS } from '../lib/types'

const DOT_CLASS: Record<string, string> = {
  VIP: 'dot-vip',
  GENEROUS: 'dot-generous',
  PROBLEMATIC: 'dot-problematic',
  BLUE: 'dot-blue',
  PURPLE: 'dot-purple',
  ORANGE: 'dot-orange',
  PINK: 'dot-pink',
  BLACK: 'dot-black',
}

/**
 * Discreet label indicators: colored dots instead of words, so a customer
 * glancing at the tablet cannot read "PROBLEMATIC" next to their own name.
 * Gold = VIP, green = Generous, red = Problematic; the other colors mean
 * whatever the shop decides. Legacy free-text labels (from before the color
 * system) show as a gray dot with the label's first letter.
 */
export default function TagBadges({ tags }: { tags: string[] | null | undefined }) {
  if (!tags || tags.length === 0) return null
  return (
    <>
      {tags.map((t) =>
        DOT_CLASS[t] ? (
          <span key={t} className={`dot ${DOT_CLASS[t]}`} title={TAG_LABELS[t] ?? t} />
        ) : (
          <span key={t} className="dot dot-custom" title={t}>
            {t.charAt(0)}
          </span>
        ),
      )}
    </>
  )
}
