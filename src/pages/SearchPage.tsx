import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Customer } from '../lib/types'
import TagBadges from '../components/TagBadges'

type Filter = 'smart' | 'name' | 'phone' | 'ref_no' | 'ic' | 'email'

const FILTER_LABELS: Record<Filter, string> = {
  smart: 'All',
  name: 'Name',
  phone: 'H/P',
  ref_no: 'Ref no.',
  ic: 'IC',
  email: 'Email',
}

const PAGE_SIZE = 50

function formatDob(d: string | null): string {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Supabase errors are plain objects, not Error instances — read .message off either. */
function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

export default function SearchPage() {
  const [term, setTerm] = useState('')
  const [bday, setBday] = useState('')
  const [filter, setFilter] = useState<Filter>('smart')
  const [results, setResults] = useState<Customer[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  // Debounced search: waits 300ms after the last keystroke.
  useEffect(() => {
    const t = setTimeout(runSearch, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, bday, filter, limit])

  async function runSearch() {
    setLoading(true)
    setError(null)
    const trimmed = term.trim()
    const bd = /^\d{4}-\d{2}-\d{2}$/.test(bday) ? bday : null

    try {
      if (!trimmed && !bd) {
        // Nothing entered: show the most recently updated customers.
        const { data, error, count } = await supabase
          .from('customers')
          .select('*', { count: 'exact' })
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(limit)
        if (error) throw error
        setResults((data as Customer[]) ?? [])
        setHasMore((count ?? 0) > (data?.length ?? 0))
      } else if (filter === 'smart' || !trimmed) {
        // Smart search; also handles birthday-only searches for any filter mode.
        const { data, error } = await supabase.rpc('search_customers', {
          q: trimmed,
          bday: bd,
          max_rows: limit,
        })
        if (error) throw error
        const rows = (data as Customer[]) ?? []
        setResults(rows)
        setHasMore(rows.length === limit)
      } else {
        // A specific field filter, optionally narrowed by birthday.
        let q = supabase.from('customers').select('*').is('deleted_at', null)
        if (filter === 'phone') {
          const digits = trimmed.replace(/\D/g, '')
          q = digits ? q.ilike('phone_digits', `%${digits}%`) : q.ilike('phone', `%${trimmed}%`)
        } else {
          q = q.ilike(filter, `%${trimmed}%`)
        }
        if (bd) {
          const yymmdd = bd.slice(2).replace(/-/g, '')
          q = q.or(`dob.eq.${bd},ic.like.${yymmdd}*`)
        }
        q = q.order(filter === 'phone' ? 'phone' : filter, { ascending: true, nullsFirst: false })
        const { data, error } = await q.limit(limit)
        if (error) throw error
        setResults((data as Customer[]) ?? [])
        setHasMore((data?.length ?? 0) === limit)
      }
    } catch (e) {
      setError(errMsg(e))
    }
    setLoading(false)
  }

  function resetPaging() {
    setLimit(PAGE_SIZE)
  }

  const trimmed = term.trim()
  const searching = trimmed !== '' || bday !== ''

  return (
    <div>
      <div className="search-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Name, phone, ref or IC…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            resetPaging()
          }}
          autoFocus
        />
        <label className="bday-box">
          <span>Birthday</span>
          <input
            type="date"
            value={bday}
            onChange={(e) => {
              setBday(e.target.value)
              resetPaging()
            }}
          />
        </label>
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as Filter)
            resetPaging()
          }}
        >
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <option key={f} value={f}>
              {FILTER_LABELS[f]}
            </option>
          ))}
        </select>
        <Link to="/customer/new" className="btn btn-primary">
          + Add Customer
        </Link>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="result-meta muted">
        {searching
          ? `${results.length}${hasMore ? '+' : ''} match${results.length === 1 && !hasMore ? '' : 'es'}`
          : 'Recently updated customers'}
        {bday && ' · born ' + formatDob(bday)}
        {loading && ' · searching…'}
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: '13%' }}>Ref</th>
            <th style={{ width: '42%' }}>Name</th>
            <th style={{ width: '22%' }}>H/P</th>
            <th style={{ width: '23%' }}>Birthday / IC</th>
          </tr>
        </thead>
        <tbody>
          {results.map((c) => (
            <tr key={c.id} className="row-link" onClick={() => navigate(`/customer/${c.id}`)}>
              <td>{c.ref_no}</td>
              <td className="cell-name">
                {c.name}
                <TagBadges tags={c.tags} />
              </td>
              <td>{c.phone}</td>
              <td>{c.dob ? formatDob(c.dob) : c.ic}</td>
            </tr>
          ))}
          {!loading && results.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-cell">
                No customers found.
                {searching && (
                  <>
                    {' '}
                    <Link to="/customer/new">Add a new customer</Link>
                  </>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {hasMore && (
        <button className="btn btn-block" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Show more
        </button>
      )}
    </div>
  )
}
