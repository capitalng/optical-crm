import { supabase } from './supabase'

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',')
  const body = rows.map((r) => columns.map((c) => escapeCell(r[c])).join(','))
  return [header, ...body].join('\r\n')
}

export function downloadCsv(filename: string, csv: string) {
  // BOM so Excel opens UTF-8 (Chinese names etc.) correctly
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Fetch every row of a table in pages of 1000 (Supabase per-request cap). */
export async function fetchAllRows(
  table: string,
  orderBy: string,
): Promise<Record<string, unknown>[]> {
  const pageSize = 1000
  const all: Record<string, unknown>[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderBy, { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return all
}
