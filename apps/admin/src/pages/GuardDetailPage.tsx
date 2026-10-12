import { errorMessage } from '@hb/api-client';
import { guardDocumentTypeLabel } from '@hb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge, ErrorBox, GuardStatusBadge, Loading, ReasonDialog, Stars } from '../components/ui';
import { api } from '../lib/client';
import { fmtDateTime, fullName } from '../lib/format';
import { useToast } from '../lib/toasts';

const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;

export function GuardDetailPage() {
  const { userId = '' } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<'reject' | 'suspend' | null>(null);
  const guard = useQuery({ queryKey: ['guard', userId], queryFn: () => api.admin.guard(userId) });

  const approve = useMutation({
    mutationFn: () => api.admin.approveGuard(userId),
    onSuccess: (g) => {
      queryClient.setQueryData(['guard', userId], g);
      void queryClient.invalidateQueries({ queryKey: ['guards'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
      toast({
        tone: 'success',
        title: 'Garde validé',
        body: `${g.user.firstName} peut désormais recevoir des missions.`,
      });
    },
    onError: (e) =>
      toast({ tone: 'danger', title: 'Validation impossible', body: errorMessage(e) }),
  });

  const openDocument = async (documentId: string) => {
    try {
      const blob = await api.admin.document(documentId);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (e) {
      toast({ tone: 'danger', title: 'Document indisponible', body: errorMessage(e) });
    }
  };

  if (guard.isLoading) return <Loading />;
  if (!guard.data)
    return (
      <div className="page">
        <ErrorBox error={guard.error} />
      </div>
    );
  const g = guard.data;

  return (
    <div className="page">
      <div className="page-header">
        <div className="stack tight">
          <Link to="/guards" className="row small">
            <ArrowLeft size={14} /> Gardes
          </Link>
          <div className="row">
            <h1>{fullName(g.user)}</h1>
            <GuardStatusBadge status={g.status} />
            {g.availableNow && <Badge tone="success">Disponible</Badge>}
          </div>
          <p className="muted">
            {g.user.email} · {g.user.phone}{' '}
            {g.user.phoneVerified ? (
              <Badge tone="success">vérifié</Badge>
            ) : (
              <Badge tone="warning">non vérifié</Badge>
            )}
          </p>
        </div>
        <span className="spacer" />
        <div className="row">
          {(g.status === 'PENDING' || g.status === 'REJECTED' || g.status === 'SUSPENDED') && (
            <button
              className="btn primary"
              disabled={approve.isPending}
              onClick={() => approve.mutate()}
            >
              {g.status === 'SUSPENDED' ? 'Réactiver' : 'Valider la candidature'}
            </button>
          )}
          {g.status === 'PENDING' && (
            <button className="btn" onClick={() => setDialog('reject')}>
              Refuser
            </button>
          )}
          {g.status === 'APPROVED' && (
            <button className="btn danger" onClick={() => setDialog('suspend')}>
              Suspendre
            </button>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card card-body">
            <h3 style={{ marginBottom: 12 }}>Vérifications</h3>
            <dl className="kv">
              <dt>Carte CNAPS</dt>
              <dd className="mono">{g.cnapsCardNumber ?? '—'}</dd>
              <dt>Candidature</dt>
              <dd>{fmtDateTime(g.submittedAt)}</dd>
              <dt>Validation</dt>
              <dd>{fmtDateTime(g.approvedAt)}</dd>
              {g.rejectionReason && (
                <>
                  <dt>Motif</dt>
                  <dd>{g.rejectionReason}</dd>
                </>
              )}
              <dt>Zone</dt>
              <dd>
                {g.baseLat !== null && g.baseLng !== null
                  ? `${g.baseLat.toFixed(4)}, ${g.baseLng.toFixed(4)}`
                  : '—'}{' '}
                · rayon {g.serviceRadiusKm} km
              </dd>
              <dt>Note</dt>
              <dd>
                <Stars value={g.ratingAvg} />{' '}
                <span className="muted small">({g.ratingCount} avis)</span>
              </dd>
            </dl>
            {g.bio && <p style={{ marginBottom: 0 }}>{g.bio}</p>}
          </div>
          <div className="card card-body stack">
            <h3>Pièces justificatives</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Chaque consultation est enregistrée dans le journal d’audit.
            </p>
            {g.documents.length === 0 && <span className="muted">Aucun document envoyé.</span>}
            {g.documents.map((d) => (
              <div key={d.id} className="row">
                <FileText size={16} />
                <span style={{ flex: 1 }}>
                  {guardDocumentTypeLabel[d.type]}{' '}
                  <span className="muted small">
                    · {d.originalName} · {fmtDateTime(d.uploadedAt)}
                  </span>
                </span>
                <button className="btn sm" onClick={() => void openDocument(d.id)}>
                  <ExternalLink size={13} /> Ouvrir
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="card card-body">
          <h3 style={{ marginBottom: 12 }}>Disponibilités hebdomadaires</h3>
          {g.availability.length === 0 ? (
            <span className="muted">Aucun créneau déclaré.</span>
          ) : (
            <dl className="kv">
              {g.availability.map((s, i) => (
                <div key={i} style={{ display: 'contents' }}>
                  <dt>{DAYS[s.dayOfWeek]}</dt>
                  <dd>
                    {hhmm(s.startMinute)} – {hhmm(s.endMinute)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <ReasonDialog
        open={dialog === 'reject'}
        title="Refuser la candidature"
        description="Le motif sera communiqué au garde, qui pourra compléter et renvoyer sa candidature."
        confirmLabel="Refuser"
        danger
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          queryClient.setQueryData(['guard', userId], await api.admin.rejectGuard(userId, reason));
          void queryClient.invalidateQueries({ queryKey: ['guards'] });
        }}
      />
      <ReasonDialog
        open={dialog === 'suspend'}
        title="Suspendre ce garde"
        description="Il ne recevra plus aucune mission ; ses propositions en cours sont retirées."
        confirmLabel="Suspendre"
        danger
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          queryClient.setQueryData(['guard', userId], await api.admin.suspendGuard(userId, reason));
          void queryClient.invalidateQueries({ queryKey: ['guards'] });
        }}
      />
    </div>
  );
}
