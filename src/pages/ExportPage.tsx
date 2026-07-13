import { useState } from 'react'
import { downloadCsv, fetchAllRows, toCsv } from '../lib/csv'

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
    'optometrist',
    'r_sph', 'r_cyl', 'r_axis', 'r_add', 'r_va', 'r_pd',
    'l_sph', 'l_cyl', 'l_axis', 'l_add', 'l_va', 'l_pd',
    'discount',
    'total_rm',
    'notes',
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
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
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
        <button className="btn btn-primary" onClick={() => exportTable('customers')}>
          All customers (CSV)
        </button>
        <button className="btn btn-primary" onClick={() => exportTable('visits')}>
          All visits (CSV)
        </button>
        <button className="btn btn-primary" onClick={() => exportTable('visit_items')}>
          All purchase items (CSV)
        </button>
      </div>
      {status && <div className="card" style={{ marginTop: 16 }}>{status}</div>}
      {error && <div className="error-box">{error}</div>}
    </div>
  )
}
