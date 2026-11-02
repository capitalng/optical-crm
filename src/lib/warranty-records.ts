import { supabase } from './supabase'
import type { WarrantyFollowup } from './types'

export async function loadWarrantyRecords(signal: AbortSignal): Promise<WarrantyFollowup[]> {
  const records: WarrantyFollowup[] = []
  const pageSize = 500
  let offset = 0
  while (true) {
    const { data, error } = await supabase.rpc('warranty_followups_v2')
      .range(offset, offset + pageSize - 1).abortSignal(signal)
    if (error) throw new Error(`Could not load warranty follow-ups: ${error.message}`)
    const page = (data ?? []) as WarrantyFollowup[]
    records.push(...page)
    if (page.length < pageSize) return records
    offset += pageSize
  }
}
