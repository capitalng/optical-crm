import { TAG_LABELS } from '../lib/types'

const TAG_CLASS: Record<string, string> = {
  VIP: 'tag-vip',
  GENEROUS: 'tag-generous',
  PROBLEMATIC: 'tag-problematic',
}

export default function TagBadges({ tags }: { tags: string[] | null | undefined }) {
  if (!tags || tags.length === 0) return null
  return (
    <>
      {tags.map((t) => (
        <span key={t} className={`tag ${TAG_CLASS[t] ?? 'tag-custom'}`}>
          {TAG_LABELS[t] ?? t}
        </span>
      ))}
    </>
  )
}
