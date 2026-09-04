import { useEffect, useState } from 'react'
import { downloadCsv, fetchAllRows, toCsv } from '../lib/csv'
import { supabase } from '../lib/supabase'
import type { DocumentUsage } from '../lib/types'
import { PLAN_STORAGE_BYTES, formatBytes } from '../lib/documents'

const TABLES: Record<string, string[]> = {
  customers: [
    'ref_no',
    'name',
    'phone',
    'email',
    'address',
    'ic',
    'occupation',
    'dob',
    'dominant_eye',
    'tags',
    'notes',
    'created_at',
    'updated_at',
    'deleted_at',
    'id',
  ],
  visits: [
    'customer_id',
    'visit_date',
    'visit_type',
    'optometrist',
    'r_sph', 'r_cyl', 'r_axis', 'r_add', 'r_va', 'r_pd',
    'l_sph', 'l_cyl', 'l_axis', 'l_add', 'l_va', 'l_pd',
    'discount',
    'total_rm',
    'notes',
    'warranty_followup',
    'warranty_note',
    'warranty_contacted_at',
    'created_at',
    'updated_at',
    'deleted_at',
    'id',
  ],
  visit_items: [
    'visit_id',
    'item_type',
    'brand',
    'model',
    'color',
    'intake',
    'thickness',
    'quantity',
    'description',
    'price',
    'created_at',
    'id',
  ],
  customer_documents: [
    'customer_id',
    'file_name',
    'label',
    'doc_date',
    'byte_size',
    'content_type',
    'storage_path',
    'created_at',
    'updated_at',
    'deleted_at',
    'id',
  ],
}

const TABLE_LABELS: Record<string, string> = {
  customers: 'All customers',
  visits: 'All visits',
  visit_items: 'All purchase items',
  customer_documents: 'Document list',
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function StorageMeter() {
  const [usage, setUsage] = useState<DocumentUsage | null>(null)

  useEffect(() => {
    supabase
      .from('customer_documents_usage')
      .select('*')
      .single()
      .then(({ data }) => {
        if (data) setUsage(data as DocumentUsage)
      })
  }, [])

  if (!usage) return null

  const used = Number(usage.active_bytes) + Number(usage.deleted_bytes)
  const pct = Math.min(100, (used / PLAN_STORAGE_BYTES) * 100)
  const nearFull = pct >= 80

  return (
    <div className={nearFull ? 'error-box' : 'card'}>
      <strong>
        {usage.active_count} document{usage.active_count === 1 ? '' : 's'} · {formatBytes(used)} of{' '}
        {formatBytes(PLAN_STORAGE_BYTES)} used ({pct.toFixed(0)}%)
      </strong>
      <div className="storage-bar">
        <div className="storage-bar-fill" style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      {nearFull && (
        <p>
          Storage is nearly full. Upgrade to Supabase Pro (100 GB, ~USD 25/month) in Dashboard →
          Settings → Billing, or clear out removed documents.
        </p>
      )}
      {Number(usage.deleted_bytes) > 0 && (
        <p className="muted">
          Including {formatBytes(Number(usage.deleted_bytes))} in {usage.deleted_count} removed
          document{usage.deleted_count === 1 ? '' : 's'} that could be reclaimed.
        </p>
      )}
      <p className="muted">
        Counts files uploaded through this app. The exact figure is in Dashboard → Storage.
      </p>
    </div>
  )
}

export default function ExportPage() {
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function exportTable(table: keyof typeof TABLES) {
    setError(null)
    setStatus(`Fetching ${table}… this can take a little while.`)
    try {
      const rows = await fetchAllRows(table, 'created_at')
      // Flatten the tags array into "VIP; GENEROUS" for Excel readability.
      const flat = rows.map((r) =>
        Array.isArray(r.tags) ? { ...r, tags: (r.tags as string[]).join('; ') } : r,
      )
      downloadCsv(`${table}-${stamp()}.csv`, toCsv(flat, TABLES[table]))
      setStatus(`Downloaded ${rows.length.toLocaleString()} ${table} rows.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus(null)
    }
  }

  return (
    <div>
      <h2>Export data</h2>
      <p className="muted">
        Downloads the complete database as CSV files (opens in Excel). Do this regularly and keep
        copies somewhere safe (e.g. the shop's Google Drive) — it is your backup if anything ever
        happens to the online database.
      </p>
      <div className="btn-row">
        {(Object.keys(TABLES) as Array<keyof typeof TABLES>).map((t) => (
          <button key={t} className="btn btn-primary" onClick={() => exportTable(t)}>
            {TABLE_LABELS[t]} (CSV)
          </button>
        ))}
      </div>
      {status && <div className="card" style={{ marginTop: 16 }}>{status}</div>}
      {error && <div className="error-box">{error}</div>}

      <h3 style={{ marginTop: 28 }}>Attached documents</h3>
      <p className="muted">
        The document list above records which PDF belongs to which customer, but{' '}
        <strong>it is not the files themselves</strong> — those live in Supabase Storage and need a
        separate copy. To download them all at once, run this on the shop desktop:
      </p>
      <p>
        <code>supabase storage cp -r ss://customer-docs ./optical-scans-backup --experimental</code>
      </p>
      <p className="muted">
        Or download them from Dashboard → Storage → customer-docs. The file names there match the
        “storage_path” column in the document list CSV.
      </p>
      <StorageMeter />
    </div>
  )
}
