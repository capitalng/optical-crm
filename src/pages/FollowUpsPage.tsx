import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { WarrantyFollowup } from '../lib/types'
import { buildWhatsAppUrl, formatWhatsAppNumber, toWhatsAppNumber } from '../lib/phone'
import TagBadges from '../components/TagBadges'

/** How long after purchase the shop wants to have contacted the customer. */
const WINDOW_DAYS = 180

const WINDOWS = [
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
]

function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/** "3 months ago", "12 days ago" — how long since the purchase. */
function sincePurchase(iso: string | null): string {
  const days = daysSince(iso)
  if (days <= 0) return 'today'
  if (days < 60) return `${days} day${days === 1 ? '' : 's'} ago`
  return `${Math.floor(days / 30)} months ago`
}

function formatDay(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function FollowUpsPage() {
  const [rows, setRows] = useState<WarrantyFollowup[]>([])
  const [windowDays, setWindowDays] = useState(WINDOW_DAYS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.rpc('warranty_followups', {
      window_days: windowDays,
    })
    if (error) setError(error.message)
    else setRows((data as WarrantyFollowup[]) ?? [])
    setLoading(false)
  }, [windowDays])

  useEffect(() => {
    load()
  }, [load])

  async function markContacted(row: WarrantyFollowup) {
    const { data, error } = await supabase
      .from('visits')
      .update({ warranty_contacted_at: new Date().toISOString() })
      .eq('id', row.visit_id)
      .select('id')
    if (error) setError('Could not update: ' + error.message)
    else if (!data || data.length === 0)
      setError('Could not update: the database did not change the record.')
    else load()
  }

  const windowLabel = WINDOWS.find((w) => w.days === windowDays)?.label ?? `${windowDays} days`

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Warranty follow-ups</h2>
          <p className="muted">
            Customers who bought something under warranty and should be contacted within{' '}
            {windowLabel} of their purchase. They leave this list once you mark them contacted, or
            automatically when the {windowLabel} is up.
          </p>
        </div>
        <label className="bday-box">
          <span>Within</span>
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
            {WINDOWS.map((w) => (
              <option key={w.days} value={w.days}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="result-meta muted">
        {loading
          ? 'Loading…'
          : `${rows.length} customer${rows.length === 1 ? '' : 's'} to contact`}
      </div>

      {!loading && rows.length === 0 && (
        <div className="card muted">
          Nobody to contact. Customers appear here when a visit is saved with “Warranty — follow up
          with this customer” ticked.
        </div>
      )}

      {rows.map((row) => {
        const elapsed = daysSince(row.purchased_at)
        const remaining = windowDays - elapsed
        const urgent = remaining <= 30
        const number = toWhatsAppNumber(row.customer_phone)
        return (
          <div className={`card followup-row ${urgent ? 'followup-urgent' : ''}`} key={row.visit_id}>
            <div className="followup-main">
              <div className="followup-name">
                <Link to={`/customer/${row.customer_id}`}>{row.customer_name ?? '(no name)'}</Link>
                <TagBadges tags={row.customer_tags} />
                <span className="muted"> · {row.ref_no ?? 'no ref'}</span>
              </div>
              <div className="followup-detail">
                <strong>{row.items ?? 'Purchase'}</strong>
                {row.total_rm != null && <span className="muted"> · RM {row.total_rm}</span>}
                {row.warranty_note && <span className="muted"> — {row.warranty_note}</span>}
              </div>
              <div className="followup-meta muted">
                Bought {formatDay(row.purchased_at)} ({sincePurchase(row.purchased_at)})
                {remaining > 0 ? (
                  <span className={urgent ? 'followup-remaining' : undefined}>
                    {' '}
                    · {remaining} day{remaining === 1 ? '' : 's'} left to contact
                  </span>
                ) : (
                  <span className="followup-remaining"> · window closing</span>
                )}
              </div>
            </div>

            <div className="followup-actions">
              {row.customer_phone ? (
                <span className="followup-phone">{row.customer_phone}</span>
              ) : (
                <span className="muted">No phone number</span>
              )}
              {number && (
                <a
                  className="btn btn-small"
                  href={buildWhatsAppUrl(number)}
                  target="_blank"
                  rel="noopener"
                >
                  Open WhatsApp · {formatWhatsAppNumber(number)}
                </a>
              )}
              <button className="btn btn-primary" onClick={() => markContacted(row)}>
                Mark contacted
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
