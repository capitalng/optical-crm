import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { WarrantyFollowup } from '../lib/types'
import { loadWarrantyRecords } from '../lib/warranty-records'
import { malaysiaToday, warrantyDaysBetween, warrantyEndDate, warrantySection } from '../lib/warranty'
import type { WarrantySection } from '../lib/warranty'
import { buildWhatsAppUrl, toWhatsAppNumber } from '../lib/phone'
import TagBadges from '../components/TagBadges'

const SECTIONS: { key: WarrantySection; label: string }[] = [
  { key: 'pending', label: 'To contact' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'ended', label: 'Window ended' },
]

function timingLabel(row: WarrantyFollowup, today: string, months: number): string {
  if (!row.warranty_start_date) return 'Awaiting collection - set the start date when collected'
  const elapsed = warrantyDaysBetween(row.warranty_start_date, today)
  if (elapsed < 0) return `Starts in ${-elapsed} days`
  const remaining = warrantyDaysBetween(today, warrantyEndDate(row.warranty_start_date, months))
  if (remaining <= 0) return `${elapsed} days since warranty started | Follow-up window ended`
  return `${elapsed} days since warranty started | ${remaining} days left to contact`
}

export default function FollowUpsPage() {
  const [rows, setRows] = useState<WarrantyFollowup[]>([])
  const [months, setMonths] = useState(6)
  const [section, setSection] = useState<WarrantySection>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [today, setToday] = useState(() => malaysiaToday(new Date()))
  const [query, setQuery] = useState('')
  const operation = useRef<AbortController | null>(null)
  const mutationBusy = useRef(false)
  const alive = useRef(true)

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const records = await loadWarrantyRecords(signal)
      if (signal.aborted) return
      setRows(records)
    } catch (cause) {
      if (signal.aborted) return
      setError(cause instanceof Error ? cause.message : 'Could not load warranty records.')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    void load(controller.signal)
    const timer = window.setInterval(() => setToday(malaysiaToday(new Date())), 60_000)
    return () => {
      alive.current = false
      controller.abort()
      operation.current?.abort()
      window.clearInterval(timer)
    }
  }, [load])

  async function setContacted(row: WarrantyFollowup, contacted: boolean) {
    if (mutationBusy.current) return
    mutationBusy.current = true
    const controller = new AbortController()
    operation.current = controller
    setBusyId(row.visit_id)
    setError(null)
    setNotice(null)
    const timestamp = contacted ? new Date().toISOString() : null
    try {
      const { data, error: updateError } = await supabase.from('visits')
        .update({ warranty_contacted_at: timestamp }).eq('id', row.visit_id)
        .select('id').abortSignal(controller.signal)
      if (updateError) throw new Error(`Could not update warranty: ${updateError.message}`)
      if (!data?.length) throw new Error('The record was not updated. Please reload and try again.')
      if (!alive.current) return
      setRows((previous) => previous.map((record) => record.visit_id === row.visit_id
        ? { ...record, warranty_contacted_at: timestamp } : record))
      window.dispatchEvent(new Event('warranty-updated'))
      if (contacted) {
        setNotice('Moved to Contacted. Open that section to undo.')
        return
      }
      const target = warrantySection({ ...row, warranty_contacted_at: null }, today, months)
      setSection(target)
      setNotice(target === 'ended'
        ? 'Contact status undone. The follow-up window has ended; edit the visit to correct its start date if needed.'
        : 'Moved back to To contact.')
    } catch (cause) {
      if (!alive.current) return
      setError(cause instanceof Error ? cause.message : 'Could not update warranty.')
    } finally {
      mutationBusy.current = false
      if (alive.current) setBusyId(null)
    }
  }

  const counts = Object.fromEntries(SECTIONS.map(({ key }) => [key,
    rows.filter((row) => warrantySection(row, today, months) === key).length]))
  const search = query.trim().toLowerCase()
  const visible = rows.filter((row) => warrantySection(row, today, months) === section)
    .filter((row) => !search || [row.customer_name, row.customer_phone, row.ref_no, row.items]
      .some((value) => value?.toLowerCase().includes(search)))

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Warranty follow-ups</h2>
          <p className="muted">Follow up within {months} months of the warranty start date. Contacted records stay available with Undo.</p>
        </div>
        <label className="bday-box">
          <span>Follow-up window</span>
          <select value={months} onChange={(event) => setMonths(Number(event.target.value))}>
            <option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>1 year</option>
          </select>
        </label>
      </div>
      <div className="btn-row" role="group" aria-label="Warranty sections">
        {SECTIONS.map(({ key, label }) => (
          <button type="button" key={key} aria-pressed={section === key}
            className={`btn ${section === key ? 'btn-primary' : ''}`}
            onClick={() => { setSection(key); setNotice(null) }}>
            {label} ({counts[key] ?? 0})
          </button>
        ))}
      </div>
      <label className="warranty-search">Find a customer or purchase
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, ref or item" />
      </label>
      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Loading...</p>}
      {!loading && !visible.length && <div className="card muted">No matching warranty records in this section.</div>}
      {visible.map((row) => {
        const number = toWhatsAppNumber(row.customer_phone)
        const remaining = row.warranty_start_date
          ? warrantyDaysBetween(today, warrantyEndDate(row.warranty_start_date, months)) : null
        const urgent = section === 'pending' && remaining !== null && remaining > 0 && remaining <= 30
        return (
          <div className={`card followup-row ${urgent ? 'followup-urgent' : ''}`} key={row.visit_id}>
            <div className="followup-main">
              <div className="followup-name">
                <Link to={`/customer/${row.customer_id}`}>{row.customer_name ?? '(no name)'}</Link>
                <TagBadges tags={row.customer_tags} /><span className="muted"> | {row.ref_no ?? 'no ref'}</span>
              </div>
              <div className="followup-detail"><strong>{row.items ?? 'Purchase'}</strong>
                {row.warranty_note && <span> - {row.warranty_note}</span>}
              </div>
              <div className="followup-meta muted">Visit: {row.visit_date ?? '-'} | Warranty starts: {row.warranty_start_date ?? 'Not set'}</div>
              <div className="followup-meta muted">{timingLabel(row, today, months)}</div>
              {row.warranty_contacted_at && <div className="followup-meta muted">Contacted: {new Date(row.warranty_contacted_at).toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}</div>}
            </div>
            <div className="followup-actions">
              <span className="followup-phone">{row.customer_phone ?? 'No phone number'}</span>
              {number && <a className="btn btn-small" href={buildWhatsAppUrl(number)} target="_blank" rel="noopener">Open WhatsApp</a>}
              <Link className="btn btn-small" to={`/customer/${row.customer_id}`}>View / edit visit</Link>
              <button type="button" className="btn btn-primary" disabled={busyId !== null}
                onClick={() => void setContacted(row, !row.warranty_contacted_at)}>
                {busyId === row.visit_id ? 'Saving…' : row.warranty_contacted_at ? 'Undo contacted' : 'Mark contacted'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
