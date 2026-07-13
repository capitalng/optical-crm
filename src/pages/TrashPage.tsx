import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Customer } from '../lib/types'

export default function TrashPage() {
  const [items, setItems] = useState<Customer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(200)
    if (error) setError(error.message)
    else setItems((data as Customer[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function restore(c: Customer) {
    const { data, error } = await supabase
      .from('customers')
      .update({ deleted_at: null })
      .eq('id', c.id)
      .select('id')
    if (error) setError('Restore failed: ' + error.message)
    else if (!data || data.length === 0) setError('Restore failed: the database did not update the record.')
    else load()
  }

  return (
    <div>
      <h2>Trash</h2>
      <p className="muted">
        Deleted customers are kept here and can be restored. Their prescriptions come back with
        them. Nothing is permanently erased by the app.
      </p>
      {error && <div className="error-box">{error}</div>}
      {loading && <div className="muted">Loading…</div>}
      {!loading && items.length === 0 && <div className="card muted">Trash is empty.</div>}
      {items.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Name</th>
              <th>H/P</th>
              <th>Deleted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{c.ref_no}</td>
                <td className="cell-name">{c.name}</td>
                <td>{c.phone}</td>
                <td>{c.deleted_at && new Date(c.deleted_at).toLocaleDateString()}</td>
                <td>
                  <button className="btn btn-small" onClick={() => restore(c)}>
                    Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
