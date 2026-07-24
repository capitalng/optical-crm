import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { ItemType, VisitItem, VisitWithItems } from '../lib/types'
import { ITEM_TYPE_LABELS } from '../lib/types'

const RX_FIELDS = ['sph', 'cyl', 'axis', 'add', 'va', 'pd'] as const
const RX_LABELS: Record<(typeof RX_FIELDS)[number], string> = {
  sph: 'SPH',
  cyl: 'CYL',
  axis: 'AXIS',
  add: 'ADD',
  va: 'V.A',
  pd: 'PD',
}

/** Which columns each item type shows. Everything is optional — freedom first. */
const ITEM_FIELDS: Record<ItemType, Array<keyof ItemDraft>> = {
  frame: ['brand', 'model', 'color', 'price'],
  lens: ['brand', 'thickness', 'price'],
  contact_lens: ['brand', 'color', 'quantity', 'price'],
  other: ['description', 'quantity', 'price'],
}

const ITEM_FIELD_LABELS: Record<string, string> = {
  brand: 'Brand',
  model: 'Model',
  color: 'Color',
  intake: 'Intake',
  thickness: 'Thickness',
  quantity: 'Qty',
  description: 'Description',
  price: 'Price (RM)',
}

interface ItemDraft {
  key: number
  item_type: ItemType
  brand: string
  model: string
  color: string
  intake: string
  thickness: string
  quantity: string
  description: string
  price: string
}

let draftKey = 0

function itemToDraft(item: VisitItem): ItemDraft {
  return {
    key: draftKey++,
    item_type: item.item_type,
    brand: item.brand ?? '',
    model: item.model ?? '',
    color: item.color ?? '',
    intake: item.intake ?? '',
    thickness: item.thickness ?? '',
    quantity: item.quantity ?? '',
    description: item.description ?? '',
    price: item.price != null ? String(item.price) : '',
  }
}

function emptyDraft(type: ItemType): ItemDraft {
  return {
    key: draftKey++,
    item_type: type,
    brand: '',
    model: '',
    color: '',
    intake: '',
    thickness: '',
    quantity: '',
    description: '',
    price: '',
  }
}

/** Lenient price parsing: accepts "250", "250.50", "RM 1,250.00". */
function parsePrice(raw: string): number | null | undefined {
  const s = raw.trim()
  if (s === '') return null
  const n = Number(s.replace(/rm/i, '').replace(/[,\s]/g, ''))
  return Number.isNaN(n) ? undefined : n
}

/**
 * Discount in RM, from what staff typed: "20", "RM20", "-20" (fixed) or
 * "30%", "-30%" (percentage of the subtotal). Null if empty or unparseable
 * — staff may also write free text like "member price"; that still saves,
 * it just cannot be auto-calculated.
 */
function discountToRm(raw: string, subtotal: number | null): number | null {
  const s = raw.trim().replace(/^[-−]\s*/, '')
  if (s === '') return null
  const pct = s.match(/^(\d+(?:\.\d+)?)\s*%$/)
  if (pct) return subtotal !== null ? (subtotal * Number(pct[1])) / 100 : null
  const n = Number(s.replace(/rm/i, '').replace(/[,\s]/g, ''))
  return Number.isNaN(n) ? null : n
}

/**
 * Shorthand diopter entry: SPH/CYL/ADD are always x.xx, so staff can skip the
 * dot — "-125" becomes "-1.25", "275" becomes "2.75", "+175" typed with a dot
 * stays as typed. Anything that isn't a plain signed integer (e.g. "PL",
 * "1.75") passes through untouched.
 */
function normalizeDiopter(raw: string): string {
  const s = raw.trim()
  if (!/^[+-]?\d+$/.test(s)) return raw
  const sign = s.startsWith('+') ? '+' : ''
  const value = Number(s) / 100
  return sign + value.toFixed(2)
}

const DIOPTER_FIELDS = new Set(['sph', 'cyl', 'add'])

interface Props {
  customerId: string
  existing?: VisitWithItems
  onSaved: () => void
  onCancel: () => void
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function VisitForm({ customerId, existing, onSaved, onCancel }: Props) {
  const [visitDate, setVisitDate] = useState(existing?.visit_date ?? today())
  const [visitType, setVisitType] = useState<'glasses' | 'contact_lens' | null>(
    existing?.visit_type ?? null,
  )
  const [optometrist, setOptometrist] = useState(existing?.optometrist ?? '')
  const [discount, setDiscount] = useState(existing?.discount ?? '')
  const [totalRm, setTotalRm] = useState(existing?.total_rm != null ? String(existing.total_rm) : '')
  // Total fills itself from items − discount until the staff type their own figure.
  const [totalTouched, setTotalTouched] = useState(existing?.total_rm != null)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [items, setItems] = useState<ItemDraft[]>(() =>
    (existing?.visit_items ?? []).map(itemToDraft),
  )
  const [rx, setRx] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const eye of ['r', 'l']) {
      for (const f of RX_FIELDS) {
        const key = `${eye}_${f}`
        init[key] = (existing?.[key as keyof VisitWithItems] as string | null) ?? ''
      }
    }
    return init
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const itemsSum = useMemo(() => {
    let sum = 0
    let any = false
    for (const it of items) {
      const p = parsePrice(it.price)
      if (typeof p === 'number') {
        sum += p
        any = true
      }
    }
    return any ? sum : null
  }, [items])

  const discountRm = useMemo(() => discountToRm(discount, itemsSum), [discount, itemsSum])
  const suggestedTotal = useMemo(() => {
    if (itemsSum === null) return null
    return discountRm !== null ? Math.max(0, itemsSum - discountRm) : itemsSum
  }, [itemsSum, discountRm])

  useEffect(() => {
    if (!totalTouched) setTotalRm(suggestedTotal !== null ? suggestedTotal.toFixed(2) : '')
  }, [suggestedTotal, totalTouched])

  function setRxField(key: string, value: string) {
    setRx((prev) => ({ ...prev, [key]: value }))
  }

  function setItemField(key: number, field: keyof ItemDraft, value: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const clean = (s: string) => (s.trim() === '' ? null : s.trim())

    const total = parsePrice(totalRm)
    if (total === undefined) {
      setError('Total (RM) must be a number, e.g. 250 or 250.50')
      setBusy(false)
      return
    }

    const itemRows = []
    for (const [i, it] of items.entries()) {
      const price = parsePrice(it.price)
      if (price === undefined) {
        setError(`Item ${i + 1} (${ITEM_TYPE_LABELS[it.item_type]}): price must be a number`)
        setBusy(false)
        return
      }
      const row = {
        item_type: it.item_type,
        brand: clean(it.brand),
        model: clean(it.model),
        color: clean(it.color),
        intake: clean(it.intake),
        thickness: clean(it.thickness),
        quantity: clean(it.quantity),
        description: clean(it.description),
        price,
      }
      // Skip rows the staff added but left completely empty.
      if (Object.values(row).some((v) => v !== null && v !== row.item_type)) itemRows.push(row)
    }

    const visitPayload = {
      customer_id: customerId,
      visit_date: visitDate || null,
      visit_type: visitType,
      optometrist: clean(optometrist),
      discount: clean(discount),
      total_rm: total,
      notes: clean(notes),
      // Safety net: apply the shorthand rule on save too, in case a field
      // never lost focus before the submit.
      ...Object.fromEntries(
        Object.entries(rx).map(([k, v]) => [
          k,
          clean(DIOPTER_FIELDS.has(k.slice(2)) ? normalizeDiopter(v) : v),
        ]),
      ),
    }

    let visitId = existing?.id
    if (existing) {
      const { error } = await supabase.from('visits').update(visitPayload).eq('id', existing.id)
      if (error) {
        setError(error.message)
        setBusy(false)
        return
      }
      // Replace items wholesale — simplest correct behaviour for an edit.
      const { error: delError } = await supabase
        .from('visit_items')
        .delete()
        .eq('visit_id', existing.id)
      if (delError) {
        setError(delError.message)
        setBusy(false)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('visits')
        .insert(visitPayload)
        .select('id')
        .single()
      if (error || !data) {
        setError(error?.message ?? 'Could not save the visit')
        setBusy(false)
        return
      }
      visitId = data.id
    }

    if (itemRows.length > 0) {
      const { error } = await supabase
        .from('visit_items')
        .insert(itemRows.map((r) => ({ ...r, visit_id: visitId })))
      if (error) {
        setError('Visit saved, but items failed: ' + error.message)
        setBusy(false)
        return
      }
    }

    onSaved()
  }

  return (
    <form className="visit-form card pcard-form" onSubmit={onSubmit}>
      <div className="visit-form-head">
        <h3>{existing ? 'Edit visit' : 'New visit'}</h3>
        <div className="vtype-toggle">
          {(['glasses', 'contact_lens'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={visitType === t ? 'on' : ''}
              onClick={() => setVisitType(visitType === t ? null : t)}
            >
              {t === 'glasses' ? '👓 Glasses' : 'Contact lens'}
            </button>
          ))}
        </div>
      </div>

      <div className="visit-meta-row">
        <label>
          Date
          <input type="date" value={visitDate ?? ''} onChange={(e) => setVisitDate(e.target.value)} />
        </label>
        <label>
          Optometrist
          <input
            type="text"
            value={optometrist}
            onChange={(e) => setOptometrist(e.target.value)}
            placeholder="Name / initials"
          />
        </label>
      </div>

      <table className="rx-grid">
        <thead>
          <tr>
            <th></th>
            {RX_FIELDS.map((f) => (
              <th key={f}>{RX_LABELS[f]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(['r', 'l'] as const).map((eye) => (
            <tr key={eye}>
              <th className="rx-eye">{eye.toUpperCase()}</th>
              {RX_FIELDS.map((f) => {
                const key = `${eye}_${f}`
                return (
                  <td key={key}>
                    <input
                      type="text"
                      value={rx[key]}
                      onChange={(e) => setRxField(key, e.target.value)}
                      onBlur={
                        DIOPTER_FIELDS.has(f)
                          ? () => setRxField(key, normalizeDiopter(rx[key]))
                          : undefined
                      }
                      placeholder={f === 'va' ? '1.0' : f === 'add' ? '+2.00' : ''}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="items-head">
        <h4>Purchases (optional)</h4>
        <div className="btn-row">
          {(Object.keys(ITEM_TYPE_LABELS) as ItemType[]).map((t) => (
            <button
              key={t}
              type="button"
              className="btn btn-small"
              onClick={() => setItems((prev) => [...prev, emptyDraft(t)])}
            >
              + {ITEM_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {items.map((it, i) => (
        <div className="item-row" key={it.key}>
          <div className="item-type">{ITEM_TYPE_LABELS[it.item_type]}</div>
          {ITEM_FIELDS[it.item_type].map((field) => (
            <label key={field} className={field === 'price' ? 'item-price' : undefined}>
              {ITEM_FIELD_LABELS[field]}
              <input
                type="text"
                inputMode={field === 'price' ? 'decimal' : undefined}
                value={it[field] as string}
                onChange={(e) => setItemField(it.key, field, e.target.value)}
              />
            </label>
          ))}
          <button
            type="button"
            className="btn btn-small btn-danger item-remove"
            title={`Remove item ${i + 1}`}
            onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))}
          >
            ✕
          </button>
        </div>
      ))}

      <div className="receipt">
        {itemsSum !== null && (
          <div className="receipt-row">
            <span>Items sum</span>
            <span className="receipt-amount">RM {itemsSum.toFixed(2)}</span>
          </div>
        )}
        <div className="receipt-row">
          <label htmlFor="discount-input">Discount</label>
          <span className="receipt-amount">
            {/^\s*[-−]?\s*\d+(\.\d+)?\s*%\s*$/.test(discount) && discountRm !== null && (
              <span className="muted receipt-hint">− RM {discountRm.toFixed(2)}</span>
            )}
            <input
              id="discount-input"
              type="text"
              className="receipt-input"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="10 or 30%"
            />
          </span>
        </div>
        <div className="receipt-row receipt-total">
          <label htmlFor="total-input">Total (RM)</label>
          <input
            id="total-input"
            type="text"
            inputMode="decimal"
            className="receipt-input"
            value={totalRm}
            onChange={(e) => {
              setTotalRm(e.target.value)
              setTotalTouched(e.target.value.trim() !== '')
            }}
            placeholder="0.00"
          />
        </div>
      </div>

      <label>
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Write anything — like the blank space on the physical card"
        />
      </label>

      {error && <div className="error-box">{error}</div>}

      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save visit'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
