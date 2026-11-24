import { useEffect, useState } from 'react';

interface ReasonActionModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  label?: string;
  placeholder?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}

export function ReasonActionModal({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  label = 'Reason (3 to 300 characters)',
  placeholder = 'Write a clear reason recorded in the admin audit log…',
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}: ReasonActionModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!open) return null;

  const trimmed = reason.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 300;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="stitch-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="reason-modal-title">
        <h2 id="reason-modal-title" className={danger ? 'modal-title-danger' : 'section-title'}>
          {title}
        </h2>
        <p className="modal-description">{description}</p>
        {error ? (
          <div className="load-error" role="alert">
            {error}
          </div>
        ) : null}
        <label className="settings-field">
          <span>{label}</span>
          <textarea
            className="modal-textarea"
            rows={3}
            maxLength={300}
            value={reason}
            placeholder={placeholder}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </label>
        <p className="settings-hint">{trimmed.length}/300 characters</p>
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`button ${danger ? 'button-danger' : 'button-approve'}`}
            disabled={!valid || busy}
            onClick={() => void onConfirm(trimmed)}
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
