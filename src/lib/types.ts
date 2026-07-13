export interface Customer {
  id: string
  legacy_id: string | null
  legacy_key: string | null
  ref_no: string | null
  name: string | null
  phone: string | null
  phone_digits?: string
  email: string | null
  address: string | null
  ic: string | null
  occupation: string | null
  dob: string | null
  dominant_eye: 'L' | 'R' | null
  tags: string[]
  notes: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Visit {
  id: string
  customer_id: string
  visit_date: string | null
  optometrist: string | null
  r_sph: string | null
  r_cyl: string | null
  r_axis: string | null
  r_add: string | null
  r_va: string | null
  r_pd: string | null
  l_sph: string | null
  l_cyl: string | null
  l_axis: string | null
  l_add: string | null
  l_va: string | null
  l_pd: string | null
  discount: string | null
  total_rm: number | null
  notes: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type ItemType = 'frame' | 'lens' | 'contact_lens' | 'other'

export interface VisitItem {
  id: string
  visit_id: string
  item_type: ItemType
  brand: string | null
  model: string | null
  color: string | null
  intake: string | null
  thickness: string | null
  quantity: string | null
  description: string | null
  price: number | null
  created_at: string
}

/** A visit with its purchase items attached (shape returned by the nested select). */
export interface VisitWithItems extends Visit {
  visit_items: VisitItem[]
}

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  frame: 'Frame',
  lens: 'Lens',
  contact_lens: 'Contact lens',
  other: 'Other',
}

/** Preset customer labels; any custom text tag is also allowed. */
export const PRESET_TAGS = ['VIP', 'GENEROUS', 'PROBLEMATIC'] as const

export const TAG_LABELS: Record<string, string> = {
  VIP: 'VIP',
  GENEROUS: 'Generous',
  PROBLEMATIC: 'Problematic',
}
