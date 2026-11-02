export type WarrantySection = 'pending' | 'contacted' | 'ended'

export interface WarrantyTiming {
  warranty_start_date: string | null
  warranty_contacted_at: string | null
}

export function malaysiaToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function warrantyEndDate(startDate: string, months: number): string {
  const [year, month, day] = startDate.split('-').map(Number)
  const end = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  end.setUTCDate(Math.min(day, lastDay))
  return end.toISOString().slice(0, 10)
}

export function warrantyDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function warrantySection(record: WarrantyTiming, today: string, months: number): WarrantySection {
  if (record.warranty_contacted_at) return 'contacted'
  if (!record.warranty_start_date) return 'pending'
  if (today >= warrantyEndDate(record.warranty_start_date, months)) return 'ended'
  return 'pending'
}
