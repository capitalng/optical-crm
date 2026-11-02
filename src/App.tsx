import { useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { isConfigured, supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import SearchPage from './pages/SearchPage'
import CustomerPage from './pages/CustomerPage'
import CustomerFormPage from './pages/CustomerFormPage'
import TrashPage from './pages/TrashPage'
import ExportPage from './pages/ExportPage'
import FollowUpsPage from './pages/FollowUpsPage'
import { loadWarrantyRecords } from './lib/warranty-records'
import { malaysiaToday, warrantySection } from './lib/warranty'

/** Small badge showing how many customers are due a warranty follow-up. */
function FollowUpCount() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let controller: AbortController | null = null
    const refresh = async () => {
      controller?.abort()
      const request = new AbortController()
      controller = request
      try {
        const records = await loadWarrantyRecords(request.signal)
        if (request.signal.aborted) return
        const today = malaysiaToday(new Date())
        setCount(records.filter((row) => warrantySection(row, today, 6) === 'pending').length)
      } catch {
        if (!request.signal.aborted) setCount(null)
      }
    }
    const onRefresh = () => { void refresh() }
    onRefresh()
    window.addEventListener('warranty-updated', onRefresh)
    window.addEventListener('focus', onRefresh)
    return () => {
      controller?.abort()
      window.removeEventListener('warranty-updated', onRefresh)
      window.removeEventListener('focus', onRefresh)
    }
  }, [])

  if (!count) return null
  return <span className="nav-badge">{count}</span>
}

function SetupNotice() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Almost there</h1>
        <p>
          The app is not connected to a database yet. Copy <code>.env.example</code> to{' '}
          <code>.env</code>, fill in <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> from the Supabase dashboard, then restart the dev
          server. See <code>SETUP.md</code> for the full guide.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!isConfigured) return <SetupNotice />
  if (!ready) return <div className="login-wrap muted">Loading…</div>
  if (!session) return <LoginPage />

  return (
    <BrowserRouter>
      <header className="app-header">
        <Link to="/" className="app-title">
          Customer Records
        </Link>
        <nav>
          <NavLink to="/" end>
            Search
          </NavLink>
          <NavLink to="/followups">
            Warranty
            <FollowUpCount />
          </NavLink>
          <NavLink to="/trash">Trash</NavLink>
          <NavLink to="/export">Export</NavLink>
          <button className="btn btn-small" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/customer/new" element={<CustomerFormPage />} />
          <Route path="/customer/:id" element={<CustomerPage />} />
          <Route path="/customer/:id/edit" element={<CustomerFormPage />} />
          <Route path="/followups" element={<FollowUpsPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/export" element={<ExportPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
