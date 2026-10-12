import {
  alertStatusLabel,
  deviationTypeLabel,
  guardStatusLabel,
  missionStatusLabel,
  type AlertStatus,
  type DeviationType,
  type GuardStatus,
  type MissionStatus,
} from '@hb/shared';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { missionTone, type Tone } from '../lib/format';

export function Badge({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}

export function MissionStatusBadge({ status }: { status: MissionStatus }) {
  return (
    <Badge tone={missionTone[status]}>
      {status === 'IN_PROGRESS' && <span className="dot pulse" />}
      {missionStatusLabel[status]}
    </Badge>
  );
}

const guardTone: Record<GuardStatus, Tone> = {
  DRAFT: undefined,
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
};

export function GuardStatusBadge({ status }: { status: GuardStatus }) {
  return <Badge tone={guardTone[status]}>{guardStatusLabel[status]}</Badge>;
}

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const tone: Tone =
    status === 'OPEN' ? 'danger' : status === 'ACKNOWLEDGED' ? 'warning' : 'success';
  return <Badge tone={tone}>{alertStatusLabel[status]}</Badge>;
}

export function DeviationBadge({ type }: { type: DeviationType }) {
  return <Badge tone="warning">{deviationTypeLabel[type]}</Badge>;
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="center">
      <div className="row">
        <LoaderCircle size={18} className="spinner" />
        {label}
      </div>
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="error-box">
      {error instanceof Error ? error.message : 'Une erreur est survenue'}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pagination">
      <span className="muted small">
        {total} résultat{total > 1 ? 's' : ''}
      </span>
      <span className="spacer" />
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Précédent
      </button>
      <span className="small">
        {page} / {pages}
      </span>
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Suivant
      </button>
    </div>
  );
}

export function Stars({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  return (
    <span title={`${value.toFixed(2)} / 5`}>
      <span style={{ color: '#f5a524' }}>{'★'.repeat(Math.round(value))}</span>
      <span className="muted">{'★'.repeat(5 - Math.round(value))}</span>{' '}
      {value.toFixed(1).replace('.', ',')}
    </span>
  );
}

/** Fenêtre modale demandant un motif (refus, suspension, annulation). */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  optional,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  optional?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setReason('');
      setError(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-body">
        <h2>{title}</h2>
        {description && (
          <p className="muted" style={{ margin: 0 }}>
            {description}
          </p>
        )}
        <div className="field">
          <label htmlFor="reason">Motif{optional ? ' (facultatif)' : ''}</label>
          <textarea
            id="reason"
            className="input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>
        <ErrorBox error={error} />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button
          className={`btn ${danger ? 'danger' : 'primary'}`}
          disabled={busy || (!optional && reason.trim().length < 3)}
          onClick={() => void submit()}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
