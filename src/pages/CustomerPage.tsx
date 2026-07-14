import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Customer, VisitWithItems } from '../lib/types'
import { ITEM_TYPE_LABELS } from '../lib/types'
import VisitForm from '../components/VisitForm'
import TagBadges from '../components/TagBadges'
import ConfirmDialog from '../components/ConfirmDialog'

const RX_COLS = ['sph', 'cyl', 'axis', 'add', 'va', 'pd'] as const

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Renders "0.6 +2" with the +2 as a small superscript, the way staff write V.A. */
function renderVa(va: string | null) {
  if (!va) return ''
  const m = va.match(/^(.+?)\s*([+\-−]\s?\d+)\s*$/)
  if (!m) return va
  return (
    <>
      {m[1]}
      <sup className="va-sup">{m[2].replace(/\s/g, '')}</sup>
    </>
  )
}

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [visits, setVisits] = useState<VisitWithItems[]>([])
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [editingVisit, setEditingVisit] = useState<VisitWithItems | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState<
    { kind: 'customer' } | { kind: 'visit'; visit: VisitWithItems } | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [cRes, vRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase
        .from('visits')
        .select('*, visit_items(*)')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .order('visit_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .order('created_at', { referencedTable: 'visit_items', ascending: true }),
    ])
    if (cRes.error) setError(cRes.error.message)
    else setCustomer(cRes.data as Customer)
    if (vRes.error) setError(vRes.error.message)
    else setVisits((vRes.data as VisitWithItems[]) ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  function toggleExpanded(visitId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(visitId)) next.delete(visitId)
      else next.add(visitId)
      return next
    })
  }

  async function softDeleteCustomer() {
    if (!customer) return
    setConfirming(null)
    const { data, error } = await supabase
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', customer.id)
      .select('id')
    if (error) setError('Delete failed: ' + error.message)
    else if (!data || data.length === 0)
      setError('Delete failed: the database did not update the record (check that the app is signed in and the schema policies are in place).')
    else navigate('/')
  }

  async function softDeleteVisit(v: VisitWithItems) {
    setConfirming(null)
    const { data, error } = await supabase
      .from('visits')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', v.id)
      .select('id')
    if (error) setError('Delete failed: ' + error.message)
    else if (!data || data.length === 0) setError('Delete failed: the database did not update the record.')
    else load()
  }

  if (loading && !customer) return <div className="muted">Loading…</div>
  if (error && !customer) return <div className="error-box">{error}</div>
  if (!customer) return null

  return (
    <div>
      <div className="page-head">
        <div className="btn-row">
          <Link to={`/customer/${customer.id}/edit`} className="btn">
            Edit details
          </Link>
          <button className="btn btn-danger" onClick={() => setConfirming({ kind: 'customer' })}>
            Delete
          </button>
          {customer.deleted_at && <span className="badge badge-danger">IN TRASH</span>}
        </div>
        {!showVisitForm && !editingVisit && (
          <button className="btn btn-primary" onClick={() => setShowVisitForm(true)}>
            + New visit
          </button>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* ── The customer "card", laid out like the physical blue card ── */}
      <div className="pcard">
        <div className="pcard-row pcard-cols-3">
          <div className="pcard-cell">
            <span className="pcard-label">Name</span>
            <span className="pcard-value pcard-name">
              {customer.name ?? '—'}
              <TagBadges tags={customer.tags} />
            </span>
          </div>
          <div className="pcard-cell">
            <span className="pcard-label">Date of Birth</span>
            <span className="pcard-value">{formatDate(customer.dob)}</span>
          </div>
          <div className="pcard-cell">
            <span className="pcard-label">Ref no.</span>
            <span className="pcard-value">{customer.ref_no ?? '—'}</span>
          </div>
        </div>
        <div className="pcard-row">
          <div className="pcard-cell">
            <span className="pcard-label">Address</span>
            <span className="pcard-value">{customer.address ?? '—'}</span>
          </div>
        </div>
        <div className="pcard-row pcard-cols-2">
          <div className="pcard-cell">
            <span className="pcard-label">Tel. ☎</span>
            <span className="pcard-value">{customer.phone ?? '—'}</span>
          </div>
          <div className="pcard-cell">
            <span className="pcard-label">Email</span>
            <span className="pcard-value">{customer.email ?? '—'}</span>
          </div>
        </div>
        <div className="pcard-row pcard-cols-3">
          <div className="pcard-cell">
            <span className="pcard-label">OCC</span>
            <span className="pcard-value">{customer.occupation ?? '—'}</span>
          </div>
          <div className="pcard-cell">
            <span className="pcard-label">IC</span>
            <span className="pcard-value">{customer.ic ?? '—'}</span>
          </div>
          <div className="pcard-cell">
            <span className="pcard-label">Dominant eye</span>
            <span className="pcard-value">{customer.dominant_eye ?? 'L / R'}</span>
          </div>
        </div>
        {customer.notes && (
          <div className="pcard-row">
            <div className="pcard-cell">
              <span className="pcard-label">Notes</span>
              <span className="pcard-value prewrap">{customer.notes}</span>
            </div>
          </div>
        )}
      </div>

      {showVisitForm && (
        <VisitForm
          customerId={customer.id}
          onSaved={() => {
            setShowVisitForm(false)
            load()
          }}
          onCancel={() => setShowVisitForm(false)}
        />
      )}

      {editingVisit && (
        <VisitForm
          customerId={customer.id}
          existing={editingVisit}
          onSaved={() => {
            setEditingVisit(null)
            load()
          }}
          onCancel={() => setEditingVisit(null)}
        />
      )}

      {visits.length === 0 && !showVisitForm && (
        <div className="card muted">
          No visits recorded yet. When the customer visits, copy the physical card here with “New
          visit”.
        </div>
      )}

      {visits.length > 0 && (
        <div className="pcard-ledger-wrap">
          <table className="pcard-ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th></th>
                <th>SPH</th>
                <th>CYL</th>
                <th>AXIS</th>
                <th>ADD</th>
                <th>V.A</th>
                <th>PD</th>
                <th>Optom.</th>
                <th>Purchases</th>
                <th className="num">Total (RM)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <VisitRows
                  key={v.id}
                  visit={v}
                  expanded={expanded.has(v.id)}
                  onToggle={() => toggleExpanded(v.id)}
                  onEdit={() => {
                    setShowVisitForm(false)
                    setEditingVisit(v)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  onDelete={() => setConfirming({ kind: 'visit', visit: v })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirming?.kind === 'customer' && (
        <ConfirmDialog
          title="Delete customer?"
          message={`${customer.name ?? 'This customer'} and their visit history will move to the Trash. You can restore them later — nothing is permanently erased.`}
          requireText="DELETE"
          confirmLabel="Move to Trash"
          onConfirm={softDeleteCustomer}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming?.kind === 'visit' && (
        <ConfirmDialog
          title="Delete visit?"
          message={`The visit on ${formatDate(confirming.visit.visit_date)} will be removed from this card.`}
          confirmLabel="Delete visit"
          onConfirm={() => softDeleteVisit(confirming.visit)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

function VisitRows({
  visit: v,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  visit: VisitWithItems
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const purchaseLines = v.visit_items.map((it) =>
    [ITEM_TYPE_LABELS[it.item_type], [it.brand, it.model ?? it.description].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(': '),
  )

  return (
    <>
      {/* R row carries the shared (row-spanning) cells */}
      <tr className="row-link rx-r-row" onClick={onToggle}>
        <td rowSpan={2} className="vspan">
          {formatDate(v.visit_date)}
        </td>
        <th className="pcard-eye">R</th>
        {RX_COLS.map((f) => (
          <td key={f}>{f === 'va' ? renderVa(v.r_va) : (v[`r_${f}`] ?? '')}</td>
        ))}
        <td rowSpan={2} className="vspan">
          {v.optometrist ?? ''}
        </td>
        <td rowSpan={2} className="vspan pcard-purchases">
          {purchaseLines.length ? purchaseLines.map((line, i) => <div key={i}>{line}</div>) : ''}
        </td>
        <td rowSpan={2} className="vspan num">
          {v.total_rm != null ? v.total_rm.toFixed(2) : ''}
          {v.discount && <div className="pcard-discount">−{v.discount.replace(/^[-−]\s*/, '')}</div>}
        </td>
        <td rowSpan={2} className="vspan expand-cell">
          {expanded ? '▾' : '▸'}
        </td>
      </tr>
      <tr className="row-link rx-l-row" onClick={onToggle}>
        <th className="pcard-eye">L</th>
        {RX_COLS.map((f) => (
          <td key={f}>{f === 'va' ? renderVa(v.l_va) : (v[`l_${f}`] ?? '')}</td>
        ))}
      </tr>
      {expanded && (
        <tr className="expand-row">
          <td colSpan={12}>
            <div className="expand-body">
              {v.visit_items.length > 0 && (
                <table className="items-view">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Brand</th>
                      <th>Model / Description</th>
                      <th>Color</th>
                      <th>Thickness</th>
                      <th>Qty</th>
                      <th className="num">Price (RM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.visit_items.map((it) => (
                      <tr key={it.id}>
                        <td>{ITEM_TYPE_LABELS[it.item_type]}</td>
                        <td>{it.brand ?? '—'}</td>
                        <td>{it.model ?? it.description ?? '—'}</td>
                        <td>{it.color ?? '—'}</td>
                        <td>{it.thickness ?? '—'}</td>
                        <td>{it.quantity ?? '—'}</td>
                        <td className="num">{it.price != null ? it.price.toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {v.discount && (
                <div className="muted">
                  Discount: {v.discount}
                  {v.total_rm != null && <> · Total after discount: RM {v.total_rm.toFixed(2)}</>}
                </div>
              )}

              {v.notes && <div className="rx-notes muted prewrap">{v.notes}</div>}

              <div className="btn-row">
                <button className="btn btn-small" onClick={onEdit}>
                  Edit
                </button>
                <button className="btn btn-small btn-danger" onClick={onDelete}>
                  Delete
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
