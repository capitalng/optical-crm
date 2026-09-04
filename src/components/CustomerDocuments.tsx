import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CustomerDocument } from '../lib/types'
import {
  FILE_ACCEPT,
  formatBytes,
  signedDocUrl,
  uploadCustomerDocument,
  validateFile,
} from '../lib/documents'
import ConfirmDialog from './ConfirmDialog'

function formatDocDate(d: string | null): string {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

interface Props {
  customerId: string
}

/**
 * Scans and documents (PDFs or photos) for one customer.
 * Deliberately shows file names only — no thumbnails — so nothing sensitive
 * appears on screen unless staff explicitly open it.
 * Self-contained: owns its own data fetching so the customer page does not
 * reload the whole visit history when a file is added.
 */
export default function CustomerDocuments({ customerId }: Props) {
  const [docs, setDocs] = useState<CustomerDocument[]>([])
  const [removed, setRemoved] = useState<CustomerDocument[]>([])
  const [showRemoved, setShowRemoved] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<CustomerDocument | null>(null)
  const [pendingLink, setPendingLink] = useState<{ url: string; name: string } | null>(null)
  const [editingLabel, setEditingLabel] = useState<string | null>(null)
  // True when the database patch has not been run yet — hide the panel rather
  // than showing staff an error on every customer page.
  const [unavailable, setUnavailable] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('customer_documents')
      .select('*')
      .eq('customer_id', customerId)
      .order('doc_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message)) setUnavailable(true)
      else setError('Could not load documents: ' + error.message)
      return
    }
    const rows = (data as CustomerDocument[]) ?? []
    setDocs(rows.filter((d) => !d.deleted_at))
    setRemoved(rows.filter((d) => d.deleted_at))
  }, [customerId])

  useEffect(() => {
    load()
  }, [load])

  async function onFilesPicked(files: FileList) {
    setError(null)
    const list = Array.from(files)
    const problems: string[] = []

    // Sequential on purpose: parallel uploads on shop wifi are how you get
    // half-written objects.
    for (const [i, file] of list.entries()) {
      const problem = validateFile(file)
      if (problem) {
        problems.push(problem)
        continue
      }
      const position = list.length > 1 ? ` (${i + 1} of ${list.length})` : ''
      setBusy(
        file.type.startsWith('image/')
          ? `Shrinking and uploading ${file.name}${position}…`
          : `Uploading ${file.name}${position}…`,
      )
      try {
        await uploadCustomerDocument(customerId, file)
      } catch (e) {
        problems.push(e instanceof Error ? e.message : String(e))
      }
    }

    setBusy(null)
    // Clearing the input matters, or picking the same file again fires no event.
    if (fileRef.current) fileRef.current.value = ''
    if (problems.length) setError(problems.join(' '))
    await load()
  }

  async function openDoc(doc: CustomerDocument, download: boolean) {
    setError(null)
    setPendingLink(null)
    // The signed URL only exists after an await, by which point the user-gesture
    // context is gone and a plain window.open would be blocked. Open the tab
    // synchronously first, then point it at the URL.
    const win = download ? null : window.open('', '_blank')
    try {
      const url = await signedDocUrl(doc.storage_path, download ? doc.file_name : undefined)
      if (download) {
        window.location.href = url
      } else if (win) {
        win.location.href = url
      } else {
        // Pop-ups blocked (the iOS default): offer a real link instead.
        setPendingLink({ url, name: doc.label ?? doc.file_name })
      }
    } catch (e) {
      win?.close()
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function saveLabel(doc: CustomerDocument, label: string) {
    setEditingLabel(null)
    const next = label.trim() === '' ? null : label.trim()
    if (next === doc.label) return
    const { error } = await supabase
      .from('customer_documents')
      .update({ label: next })
      .eq('id', doc.id)
    if (error) setError('Could not save the label: ' + error.message)
    else load()
  }

  async function removeDoc(doc: CustomerDocument) {
    setConfirming(null)
    const { data, error } = await supabase
      .from('customer_documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', doc.id)
      .select('id')
    if (error) setError('Could not remove the document: ' + error.message)
    else if (!data || data.length === 0)
      setError('Could not remove the document: the database did not update the record.')
    else load()
  }

  async function restoreDoc(doc: CustomerDocument) {
    const { error } = await supabase
      .from('customer_documents')
      .update({ deleted_at: null })
      .eq('id', doc.id)
    if (error) setError('Could not restore the document: ' + error.message)
    else load()
  }

  if (unavailable) return null

  return (
    <div className="pcard pcard-docs">
      <div className={`pcard-docs-head ${docs.length ? 'has-docs' : ''}`}>
        <span className="pcard-label">
          Scans &amp; documents
          {docs.length > 0 && <span className="doc-count">{docs.length}</span>}
        </span>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-small"
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? 'Uploading…' : '+ Add file'}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          className="doc-file-input"
          accept={FILE_ACCEPT}
          multiple
          onChange={(e) => e.target.files && onFilesPicked(e.target.files)}
        />
      </div>

      {busy && <div className="pcard-doc-row muted">{busy}</div>}

      {error && (
        <div className="pcard-doc-row">
          <div className="error-box">{error}</div>
        </div>
      )}

      {pendingLink && (
        <div className="pcard-doc-row">
          <a className="btn btn-primary" href={pendingLink.url} target="_blank" rel="noopener">
            Tap to open {pendingLink.name}
          </a>
        </div>
      )}

      {docs.map((doc) => (
        <div className="pcard-doc-row" key={doc.id}>
          <span className="doc-icon" aria-hidden="true">
            {doc.content_type.startsWith('image/') ? '🖼️' : '📄'}
          </span>
          <div className="doc-main">
            {editingLabel === doc.id ? (
              <input
                type="text"
                defaultValue={doc.label ?? ''}
                autoFocus
                placeholder="e.g. Right eye"
                onBlur={(e) => saveLabel(doc, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setEditingLabel(null)
                }}
              />
            ) : (
              <button
                type="button"
                className="doc-name"
                title="Tap to name this document"
                onClick={() => setEditingLabel(doc.id)}
              >
                {doc.label ?? doc.file_name}
              </button>
            )}
            <span className="doc-meta muted">
              {[formatDocDate(doc.doc_date), formatBytes(doc.byte_size)].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-small"
              disabled={busy !== null}
              onClick={() => openDoc(doc, false)}
            >
              Open
            </button>
            <button
              type="button"
              className="btn btn-small"
              disabled={busy !== null}
              onClick={() => openDoc(doc, true)}
            >
              Save
            </button>
            <button
              type="button"
              className="btn btn-small btn-danger"
              disabled={busy !== null}
              onClick={() => setConfirming(doc)}
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      {removed.length > 0 && (
        <div className="pcard-doc-row removed-row">
          <button
            type="button"
            className="link-button muted"
            onClick={() => setShowRemoved((v) => !v)}
          >
            {showRemoved ? '▾' : '▸'} Removed documents ({removed.length})
          </button>
          {showRemoved && (
            <div className="removed-list">
              {removed.map((doc) => (
                <div className="removed-item" key={doc.id}>
                  <span className="muted">
                    {doc.label ?? doc.file_name} · {formatBytes(doc.byte_size)}
                  </span>
                  <button type="button" className="btn btn-small" onClick={() => restoreDoc(doc)}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Remove document?"
          message={`“${confirming.label ?? confirming.file_name}” will be hidden from this card. Nothing is permanently erased — it can be restored.`}
          confirmLabel="Remove"
          onConfirm={() => removeDoc(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}
