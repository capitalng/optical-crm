import { useState } from 'react'

interface Props {
  title: string
  message: string
  /** If set, the user must type this word (case-insensitive) to enable the confirm button. */
  requireText?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * In-app replacement for window.confirm / window.prompt — browsers (especially
 * on tablets) can silently block native dialogs, which made Delete appear dead.
 */
export default function ConfirmDialog({
  title,
  message,
  requireText,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState('')
  const ok = !requireText || typed.trim().toUpperCase() === requireText.toUpperCase()

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="prewrap">{message}</p>
        {requireText && (
          <label>
            Type {requireText} to confirm
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
        )}
        <div className="btn-row modal-actions">
          <button type="button" className="btn btn-danger" disabled={!ok} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
