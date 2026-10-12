import { errorMessage } from '@hb/api-client';
import { formatDuration, formatPrice, payoutStatusLabel, type PayoutStatus } from '@hb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Empty, ErrorBox, Loading, Pagination, ReasonDialog } from '../components/ui';
import { api } from '../lib/client';
import { fmtDateTime, fullName, type Tone } from '../lib/format';
import { useToast } from '../lib/toasts';

const TABS: { key: PayoutStatus | 'ALL'; label: string }[] = [
  { key: 'REQUESTED', label: 'À traiter' },
  { key: 'PAID', label: 'Payés' },
  { key: 'REJECTED', label: 'Refusés' },
  { key: 'ALL', label: 'Tous' },
];

const payoutTone: Record<PayoutStatus, Tone> = {
  REQUESTED: 'warning',
  PAID: 'success',
  REJECTED: 'danger',
};

/** Virements demandés par les gardes : faits à la main depuis la banque, puis marqués ici. */
export function PayoutsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<PayoutStatus | 'ALL'>('REQUESTED');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['payouts', status, page],
    queryFn: () =>
      api.admin.payouts({ status: status === 'ALL' ? undefined : [status], page, pageSize: 20 }),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['payouts'] });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Virements aux gardes</h1>
          <p className="muted">
            Pas de paiement automatique en v1 : faites le virement depuis la banque de la
            plateforme, puis marquez-le comme payé. Un refus rend le montant au garde.
          </p>
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <div className="chips">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`chip${status === t.key ? ' active' : ''}`}
              onClick={() => {
                setStatus(t.key);
                setPage(1);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <ErrorBox error={query.error} />
        {query.isLoading ? (
          <Loading />
        ) : query.data && query.data.items.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Demande</th>
                    <th>Garde</th>
                    <th>Montant</th>
                    <th>Compte</th>
                    <th>Statut</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDateTime(p.requestedAt)}</td>
                      <td>
                        <Link to={`/guards/${p.guard.id}`}>{fullName(p.guard)}</Link>
                        <div className="small muted">{p.guard.email}</div>
                      </td>
                      <td>
                        <strong>{formatPrice(p.amountCents)}</strong>
                      </td>
                      <td>
                        <div>{p.holderName}</div>
                        <div className="small muted mono">{p.ibanMasked}</div>
                      </td>
                      <td>
                        <Badge tone={payoutTone[p.status]}>{payoutStatusLabel[p.status]}</Badge>
                        {p.processedAt && (
                          <div className="small muted">{fmtDateTime(p.processedAt)}</div>
                        )}
                        {p.rejectionReason && <div className="small">{p.rejectionReason}</div>}
                      </td>
                      <td>
                        <button
                          className={`btn sm${p.status === 'REQUESTED' ? ' primary' : ''}`}
                          onClick={() => setSelected(p.id)}
                        >
                          {p.status === 'REQUESTED' ? 'Traiter' : 'Détails'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={query.data.total} onPage={setPage} />
          </>
        ) : (
          <Empty>{status === 'REQUESTED' ? 'Aucune demande à traiter.' : 'Aucun virement.'}</Empty>
        )}
      </div>

      <PayoutDialog
        id={selected}
        onClose={() => setSelected(null)}
        onReject={(id) => {
          setSelected(null);
          setRejecting(id);
        }}
        onPaid={() => {
          setSelected(null);
          refresh();
        }}
      />
      <ReasonDialog
        open={!!rejecting}
        title="Refuser ce virement"
        description="Le motif est envoyé au garde et le montant revient dans son solde."
        confirmLabel="Refuser"
        danger
        onClose={() => setRejecting(null)}
        onConfirm={async (reason) => {
          await api.admin.rejectPayout(rejecting!, reason);
          toast({ tone: 'success', title: 'Virement refusé', body: 'Le garde a été prévenu.' });
          refresh();
        }}
      />
    </div>
  );
}

/** Détail d'une demande avec l'IBAN complet à copier (chaque ouverture est tracée). */
function PayoutDialog({
  id,
  onClose,
  onReject,
  onPaid,
}: {
  id: string | null;
  onClose: () => void;
  onReject: (id: string) => void;
  onPaid: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const [reference, setReference] = useState('');
  const detail = useQuery({
    queryKey: ['payout', id],
    queryFn: () => api.admin.payout(id!),
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
  });
  const paid = useMutation({
    mutationFn: () => api.admin.markPayoutPaid(id!, reference.trim() || undefined),
    onSuccess: (p) => {
      toast({
        tone: 'success',
        title: 'Virement marqué comme payé',
        body: `${formatPrice(p.amountCents)} pour ${fullName(p.guard)}.`,
      });
      onPaid();
    },
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (id && !dialog.open) {
      setReference('');
      paid.reset();
      dialog.showModal();
    }
    if (!id && dialog.open) dialog.close();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (iban: string) => {
    try {
      await navigator.clipboard.writeText(iban.replace(/ /g, ''));
      toast({ tone: 'info', title: 'IBAN copié' });
    } catch (e) {
      toast({ tone: 'danger', title: 'Copie impossible', body: errorMessage(e) });
    }
  };

  const p = detail.data;
  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-body">
        <h2>Virement {p ? `de ${formatPrice(p.amountCents)}` : ''}</h2>
        <ErrorBox error={detail.error} />
        {detail.isLoading && <Loading />}
        {p && (
          <>
            <dl className="kv">
              <dt>Garde</dt>
              <dd>
                {fullName(p.guard)} <span className="muted small">· {p.guard.email}</span>
              </dd>
              <dt>Demandé le</dt>
              <dd>{fmtDateTime(p.requestedAt)}</dd>
              <dt>Titulaire</dt>
              <dd>{p.holderName}</dd>
              <dt>IBAN</dt>
              <dd className="row">
                <span className="mono">{p.iban}</span>
                <button
                  className="icon-btn"
                  title="Copier l’IBAN"
                  aria-label="Copier l’IBAN"
                  onClick={() => void copy(p.iban)}
                >
                  <Copy size={14} />
                </button>
              </dd>
              <dt>Statut</dt>
              <dd>
                <Badge tone={payoutTone[p.status]}>{payoutStatusLabel[p.status]}</Badge>{' '}
                {p.processedAt && <span className="muted small">{fmtDateTime(p.processedAt)}</span>}
              </dd>
              {p.bankReference && (
                <>
                  <dt>Référence</dt>
                  <dd className="mono">{p.bankReference}</dd>
                </>
              )}
              {p.rejectionReason && (
                <>
                  <dt>Motif du refus</dt>
                  <dd>{p.rejectionReason}</dd>
                </>
              )}
            </dl>
            {p.bankAccountRecentlyChanged && p.bankAccountChangedAt && (
              <div className="alert-item">
                <strong>Compte bancaire modifié récemment</strong>
                <div className="small">
                  Le garde a changé son IBAN le {fmtDateTime(p.bankAccountChangedAt)}, moins de 48 h
                  avant la demande. Confirmez avec lui par téléphone avant de faire le virement.
                </div>
              </div>
            )}
            <h3 style={{ margin: 0 }}>Missions couvertes</h3>
            {p.earnings.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                Aucun gain rattaché à ce virement.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Début</th>
                      <th>Fin</th>
                      <th>Durée réelle</th>
                      <th>Durée payée</th>
                      <th>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.earnings.map((e) => (
                      <tr key={e.id}>
                        <td>{fmtDateTime(e.startedAt)}</td>
                        <td>{fmtDateTime(e.endedAt)}</td>
                        <td>{formatDuration(e.durationMinutes * 60)}</td>
                        <td>
                          {formatDuration(e.billedMinutes * 60)}{' '}
                          {e.billedMinutes < e.durationMinutes && (
                            <Badge tone="warning">plafonnée</Badge>
                          )}
                        </td>
                        <td>{formatPrice(e.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {p.status === 'REQUESTED' && (
              <>
                <p className="small muted" style={{ margin: 0 }}>
                  Vérifiez que le titulaire du compte est bien le garde. Une fois le virement fait,
                  indiquez sa référence bancaire et marquez-le comme payé : le garde est prévenu.
                </p>
                <div className="field">
                  <label htmlFor="bank-reference">Référence du virement (facultatif)</label>
                  <input
                    id="bank-reference"
                    className="input"
                    value={reference}
                    maxLength={100}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>
              </>
            )}
            <ErrorBox error={paid.error} />
          </>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Fermer
        </button>
        {p?.status === 'REQUESTED' && (
          <>
            <button className="btn danger" onClick={() => onReject(p.id)}>
              Refuser
            </button>
            <button className="btn primary" disabled={paid.isPending} onClick={() => paid.mutate()}>
              Marquer comme payé
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
