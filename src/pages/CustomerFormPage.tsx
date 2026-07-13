import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Customer } from '../lib/types'
import { PRESET_TAGS, TAG_LABELS } from '../lib/types'

const EMPTY = {
  ref_no: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  ic: '',
  occupation: '',
  dob: '',
  dominant_eye: '',
  notes: '',
}

type FormState = typeof EMPTY

export default function CustomerFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [tags, setTags] = useState<string[]>([])
  const [customTag, setCustomTag] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (!id) return
    supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setError(error.message)
        } else if (data) {
          const c = data as Customer
          setForm({
            ref_no: c.ref_no ?? '',
            name: c.name ?? '',
            phone: c.phone ?? '',
            email: c.email ?? '',
            address: c.address ?? '',
            ic: c.ic ?? '',
            occupation: c.occupation ?? '',
            dob: c.dob ?? '',
            dominant_eye: c.dominant_eye ?? '',
            notes: c.notes ?? '',
          })
          setTags(c.tags ?? [])
        }
        setLoading(false)
      })
  }, [id])

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  function addCustomTag() {
    const t = customTag.trim().toUpperCase()
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
    setCustomTag('')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() && !form.ref_no.trim()) {
      setError('Enter at least a name (the ref no. is assigned automatically if left blank).')
      return
    }
    setBusy(true)
    setError(null)

    const clean = (s: string) => (s.trim() === '' ? null : s.trim())
    const payload = {
      ref_no: clean(form.ref_no)?.toUpperCase() ?? null,
      name: clean(form.name)?.toUpperCase() ?? null,
      phone: clean(form.phone),
      email: clean(form.email),
      address: clean(form.address),
      ic: clean(form.ic),
      occupation: clean(form.occupation),
      dob: clean(form.dob),
      dominant_eye: (clean(form.dominant_eye) as 'L' | 'R' | null) ?? null,
      tags,
      notes: clean(form.notes),
    }

    if (isEdit) {
      const { error } = await supabase.from('customers').update(payload).eq('id', id!)
      if (error) {
        setError(error.message)
        setBusy(false)
      } else {
        navigate(`/customer/${id}`)
      }
    } else {
      const { data, error } = await supabase
        .from('customers')
        .insert(payload)
        .select('id')
        .single()
      if (error || !data) {
        setError(error?.message ?? 'Insert failed')
        setBusy(false)
      } else {
        navigate(`/customer/${data.id}`)
      }
    }
  }

  if (loading) return <div className="muted">Loading…</div>

  return (
    <form className="card form-card pcard-form" onSubmit={onSubmit}>
      <h2>{isEdit ? 'Edit customer' : 'Add new customer'}</h2>

      <div className="form-grid">
        <label>
          Name
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>
          Date of birth
          <input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
        </label>
        <label>
          Ref no.
          <input
            type="text"
            value={form.ref_no}
            onChange={(e) => set('ref_no', e.target.value)}
            placeholder={isEdit ? undefined : 'leave blank — assigned automatically'}
          />
        </label>
        <label>
          Tel. ☎ (H/P)
          <input type="text" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </label>
        <label className="form-wide">
          Address
          <input type="text" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </label>
        <label>
          IC
          <input type="text" value={form.ic} onChange={(e) => set('ic', e.target.value)} />
        </label>
        <label>
          OCC (occupation)
          <input
            type="text"
            value={form.occupation}
            onChange={(e) => set('occupation', e.target.value)}
          />
        </label>
        <label>
          Dominant eye
          <select value={form.dominant_eye} onChange={(e) => set('dominant_eye', e.target.value)}>
            <option value="">—</option>
            <option value="L">L</option>
            <option value="R">R</option>
          </select>
        </label>

        <div className="form-wide">
          <span className="field-label">Labels</span>
          <div className="tag-editor">
            {PRESET_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className={`tag-toggle ${tags.includes(t) ? 'on' : ''}`}
                onClick={() => toggleTag(t)}
              >
                {TAG_LABELS[t]}
              </button>
            ))}
            {tags
              .filter((t) => !(PRESET_TAGS as readonly string[]).includes(t))
              .map((t) => (
                <button
                  key={t}
                  type="button"
                  className="tag-toggle on"
                  title="Click to remove"
                  onClick={() => toggleTag(t)}
                >
                  {t} ✕
                </button>
              ))}
            <input
              type="text"
              className="tag-input"
              placeholder="+ custom label"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustomTag()
                }
              }}
              onBlur={addCustomTag}
            />
          </div>
        </div>

        <label className="form-wide">
          Notes
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            placeholder="Write anything — like the blank space on the physical card"
          />
        </label>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add customer'}
        </button>
        <button type="button" className="btn" onClick={() => navigate(-1)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
