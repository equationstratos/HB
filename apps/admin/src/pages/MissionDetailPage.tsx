import { errorMessage } from '@hb/api-client';
import {
  allowedNextStatuses,
  deviationTypeLabel,
  formatDistance,
  formatDuration,
  missionTypeLabel,
  roleLabel,
  transportModeLabel,
} from '@hb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Phone, Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { MissionMap } from '../components/MissionMap';
import {
  AlertStatusBadge,
  Badge,
  Empty,
  ErrorBox,
  Loading,
  MissionStatusBadge,
  ReasonDialog,
  Stars,
} from '../components/ui';
import { api } from '../lib/client';
import { fmtDateTime, fmtTime, fullName } from '../lib/format';
import { useRealtime } from '../lib/realtime';
import { useToast } from '../lib/toasts';

export function MissionDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { socket, positions } = useRealtime();
  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  const mission = useQuery({ queryKey: ['mission', id], queryFn: () => api.admin.mission(id) });
  const track = useQuery({ queryKey: ['track', id], queryFn: () => api.admin.locations(id) });
  const messages = useQuery({ queryKey: ['messages', id], queryFn: () => api.admin.messages(id) });
  const sos = useQuery({ queryKey: ['alerts', 'sos', id], queryFn: () => api.admin.sos(id) });
  const deviations = useQuery({
    queryKey: ['alerts', 'deviations', id],
    queryFn: () => api.admin.deviations(id),
  });
  const contacts = useQuery({
    queryKey: ['contacts', id],
    queryFn: () => api.admin.contacts(id),
    enabled: showContacts,
  });

  useEffect(() => {
    if (!socket) return;
    // L'admin reçoit déjà toutes les positions ; on rejoint la salle pour le chat.
    void socket
      .timeout(5000)
      .emitWithAck('mission:join', { missionId: id })
      .catch(() => undefined);
    return () => {
      socket.emit('mission:leave', { missionId: id });
    };
  }, [socket, id]);

  const relaunch = useMutation({
    mutationFn: () => api.admin.relaunch(id),
    onSuccess: (m) => {
      queryClient.setQueryData(['mission', id], m);
      toast({ tone: 'success', title: 'Recherche relancée' });
    },
    onError: (e) => toast({ tone: 'danger', title: 'Relance impossible', body: errorMessage(e) }),
  });

  if (mission.isLoading) return <Loading />;
  if (mission.error || !mission.data)
    return (
      <div className="page">
        <ErrorBox error={mission.error} />
      </div>
    );
  const m = mission.data;
  const live = positions[m.id];
  const lastClient =
    live?.client ?? [...(track.data ?? [])].reverse().find((l) => l.role === 'CLIENT') ?? null;
  const lastGuard =
    live?.guard ?? [...(track.data ?? [])].reverse().find((l) => l.role === 'GUARD') ?? null;
  const clientTrack = (track.data ?? []).filter((l) => l.role === 'CLIENT');
  const canCancel = allowedNextStatuses(m.status, 'ADMIN').includes('CANCELLED');
  const canAssign = ['SEARCHING', 'UNASSIGNED', 'ASSIGNED', 'GUARD_EN_ROUTE'].includes(m.status);

  return (
    <div className="page">
      <div className="page-header">
        <div className="stack tight">
          <Link to="/missions" className="row small">
            <ArrowLeft size={14} /> Protections
          </Link>
          <div className="row">
            <h1>Protection de {fullName(m.client)}</h1>
            <MissionStatusBadge status={m.status} />
          </div>
          <p className="muted">
            Départ {fmtDateTime(m.departureAt)} · {missionTypeLabel[m.type]} · mot de code{' '}
            <strong>{m.codeWord}</strong>
          </p>
        </div>
        <span className="spacer" />
        <div className="row wrap">
          <button className="btn" onClick={() => setShowContacts(true)}>
            <Phone size={15} /> Coordonnées
          </button>
          {m.status === 'UNASSIGNED' && (
            <button className="btn" disabled={relaunch.isPending} onClick={() => relaunch.mutate()}>
              Relancer la recherche
            </button>
          )}
          {canAssign && (
            <button className="btn primary" onClick={() => setAssignOpen(true)}>
              {m.guard ? 'Réattribuer' : 'Attribuer un garde'}
            </button>
          )}
          {canCancel && (
            <button className="btn danger" onClick={() => setCancelOpen(true)}>
              Annuler
            </button>
          )}
        </div>
      </div>

      {showContacts && (
        <div className="card card-body" style={{ marginBottom: 16 }}>
          {contacts.isLoading ? (
            <Loading label="Chargement des coordonnées…" />
          ) : contacts.data ? (
            <div className="row wrap" style={{ gap: 28 }}>
              <span>
                Cliente : <strong>{contacts.data.client.name}</strong> —{' '}
                <a href={`tel:${contacts.data.client.phone}`}>{contacts.data.client.phone}</a>
              </span>
              {contacts.data.guard && (
                <span>
                  Garde : <strong>{contacts.data.guard.name}</strong> —{' '}
                  <a href={`tel:${contacts.data.guard.phone}`}>{contacts.data.guard.phone}</a>
                </span>
              )}
              {contacts.data.emergencyContacts.map((c) => (
                <span key={c.phone}>
                  Contact d’urgence : <strong>{c.name}</strong>
                  {c.relation ? ` (${c.relation})` : ''} — <a href={`tel:${c.phone}`}>{c.phone}</a>
                </span>
              ))}
              <span className="small muted">Consultation enregistrée dans le journal d’audit.</span>
            </div>
          ) : (
            <ErrorBox error={contacts.error} />
          )}
        </div>
      )}

      <div className="grid-2">
        <div className="stack">
          <div className="card map-card mission-map">
            <MissionMap
              className="map"
              missions={[
                {
                  id: m.id,
                  label: m.client.firstName,
                  route: m.route,
                  client: lastClient,
                  guard: lastGuard,
                  selected: true,
                },
              ]}
              track={clientTrack}
            />
          </div>
          <div className="card">
            <div className="card-header">
              <h3>Alertes</h3>
            </div>
            {(sos.data?.length ?? 0) + (deviations.data?.length ?? 0) === 0 && (
              <Empty>Aucune alerte sur cette protection.</Empty>
            )}
            {sos.data?.map((a) => (
              <div key={a.id} className="alert-item sos">
                <div className="row">
                  <strong>SOS {a.raisedByRole === 'GUARD' ? '(garde)' : ''}</strong>
                  <span className="small muted">{fmtDateTime(a.createdAt)}</span>
                  <span className="spacer" />
                  <AlertStatusBadge status={a.status} />
                </div>
                {a.message && <span className="small">{a.message}</span>}
                {a.note && <span className="small muted">Note : {a.note}</span>}
              </div>
            ))}
            {deviations.data?.map((d) => (
              <div key={d.id} className="alert-item">
                <div className="row">
                  <strong>{deviationTypeLabel[d.type]}</strong>
                  <span className="small muted">{fmtDateTime(d.createdAt)}</span>
                  <span className="spacer" />
                  <AlertStatusBadge status={d.status} />
                </div>
                <span className="small muted">
                  {d.distanceMeters ? `À ${formatDistance(d.distanceMeters)} du trajet. ` : ''}
                  {d.note ??
                    (d.clientConfirmedOk === true
                      ? 'La cliente a confirmé que tout allait bien.'
                      : d.clientConfirmedOk === false
                        ? 'La cliente a demandé de l’aide.'
                        : 'Pas encore de réponse de la cliente.')}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card card-body">
            <dl className="kv">
              <dt>Cliente</dt>
              <dd>{fullName(m.client)}</dd>
              <dt>Garde</dt>
              <dd>
                {m.guard ? (
                  <span className="row">
                    {fullName(m.guard)} <Stars value={m.guard.ratingAvg} />
                  </span>
                ) : (
                  <span className="muted">Non attribué</span>
                )}
              </dd>
              <dt>Mode</dt>
              <dd>{transportModeLabel[m.route.mode]}</dd>
              <dt>Trajet</dt>
              <dd>
                {m.route.waypoints.map((w, i) => (
                  <div key={i} className="small">
                    {i === 0
                      ? 'Départ'
                      : i === m.route.waypoints.length - 1
                        ? 'Arrivée'
                        : `Étape ${i}`}{' '}
                    : {w.address ?? `${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}`}
                  </div>
                ))}
              </dd>
              <dt>Distance / durée</dt>
              <dd>
                {formatDistance(m.route.distanceMeters)} · {formatDuration(m.route.durationSeconds)}
                {m.route.approximate && <Badge tone="warning">approximatif</Badge>}
              </dd>
              <dt>Tolérance d’écart</dt>
              <dd>
                {m.route.toleranceMeters} m (version {m.route.version} du trajet)
              </dd>
              <dt>Arrivée prévue</dt>
              <dd>{fmtDateTime(m.route.expectedArrivalAt)}</dd>
              {m.notes && (
                <>
                  <dt>Consignes</dt>
                  <dd>{m.notes}</dd>
                </>
              )}
              {m.rating && (
                <>
                  <dt>Note</dt>
                  <dd>
                    <Stars value={m.rating.score} />{' '}
                    {m.rating.comment && <span className="muted">« {m.rating.comment} »</span>}
                  </dd>
                </>
              )}
              {m.cancelReason && (
                <>
                  <dt>Motif d’annulation</dt>
                  <dd>{m.cancelReason}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="card card-body">
            <h3 style={{ marginBottom: 10 }}>Chronologie</h3>
            <ol className="timeline">
              <Step at={m.createdAt} label="Réservation" />
              <Step at={m.assignedAt} label="Garde attribué" />
              <Step at={m.enRouteAt} label="Garde en route" />
              <Step at={m.startedAt} label="Protection commencée" />
              <Step at={m.completedAt} label="Arrivée, protection terminée" />
              <Step at={m.cancelledAt} label="Annulée" />
            </ol>
          </div>

          <Chat missionId={m.id} messages={messages.data ?? []} />
        </div>
      </div>

      <AssignDialog missionId={m.id} open={assignOpen} onClose={() => setAssignOpen(false)} />
      <ReasonDialog
        open={cancelOpen}
        title="Annuler la protection"
        description="La cliente et le garde seront prévenus."
        confirmLabel="Annuler la protection"
        danger
        optional
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          const updated = await api.admin.cancel(m.id, reason || undefined);
          queryClient.setQueryData(['mission', m.id], updated);
        }}
      />
    </div>
  );
}

function Step({ at, label }: { at: string | null; label: string }) {
  if (!at) return null;
  return (
    <li>
      <span className="when">{fmtTime(at)}</span>
      <span>{label}</span>
    </li>
  );
}

function Chat({
  missionId,
  messages,
}: {
  missionId: string;
  messages: { id: string; senderRole: string; body: string; createdAt: string }[];
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [messages.length]);
  const send = useMutation({
    mutationFn: () => api.admin.sendMessage(missionId, body.trim()),
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey: ['messages', missionId] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (body.trim()) send.mutate();
  };
  return (
    <div className="card card-body stack">
      <h3>Messagerie</h3>
      <div className="chat">
        {messages.length === 0 && <span className="muted small">Aucun message.</span>}
        {messages.map((msg) => (
          <div key={msg.id} className={`bubble ${msg.senderRole.toLowerCase()}`}>
            <div className="small muted">
              {roleLabel[msg.senderRole as keyof typeof roleLabel]} · {fmtTime(msg.createdAt)}
            </div>
            {msg.body}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={submit}>
        <input
          className="input"
          placeholder="Écrire en tant qu’équipe de supervision…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          className="btn primary"
          disabled={send.isPending || !body.trim()}
          aria-label="Envoyer"
        >
          <Send size={15} />
        </button>
      </form>
      {send.error && <ErrorBox error={send.error} />}
    </div>
  );
}

function AssignDialog({
  missionId,
  open,
  onClose,
}: {
  missionId: string;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const candidates = useQuery({
    queryKey: ['candidates', missionId],
    queryFn: () => api.admin.candidates(missionId),
    enabled: open,
  });
  const guards = useQuery({
    queryKey: ['guards', 'APPROVED', search],
    queryFn: () => api.admin.guards({ status: ['APPROVED'], q: search || undefined, pageSize: 10 }),
    enabled: open,
  });
  const assign = useMutation({
    mutationFn: (guardId: string) => api.admin.assign(missionId, guardId),
    onSuccess: (m) => {
      queryClient.setQueryData(['mission', missionId], m);
      toast({
        tone: 'success',
        title: 'Garde attribué',
        body: `${m.guard?.firstName ?? ''} a été prévenu.`,
      });
      onClose();
    },
    onError: (e) =>
      toast({ tone: 'danger', title: 'Attribution impossible', body: errorMessage(e) }),
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-body">
        <h2>Attribuer un garde</h2>
        <div className="stack tight">
          <strong className="small">Suggestions (disponibles, proches, sans chevauchement)</strong>
          {candidates.isLoading && <Loading />}
          {candidates.data?.length === 0 && (
            <span className="muted small">
              Aucun garde disponible automatiquement sur ce créneau.
            </span>
          )}
          {candidates.data?.map((c) => (
            <div key={c.guardId} className="row">
              <span style={{ flex: 1 }}>
                {c.guard ? fullName(c.guard.user) : c.guardId}{' '}
                <span className="muted small">
                  à {formatDistance(c.distanceMeters)} · <Stars value={c.ratingAvg} />
                </span>
              </span>
              <button
                className="btn sm primary"
                disabled={assign.isPending}
                onClick={() => assign.mutate(c.guardId)}
              >
                Attribuer
              </button>
            </div>
          ))}
        </div>
        <div className="field">
          <label htmlFor="guard-search">Ou chercher un garde validé</label>
          <input
            id="guard-search"
            className="input"
            placeholder="Nom ou email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="stack tight">
          {guards.data?.items.map((g) => (
            <div key={g.userId} className="row">
              <span style={{ flex: 1 }}>
                {fullName(g.user)}{' '}
                <span className="muted small">
                  {g.availableNow ? '· disponible' : '· indisponible'}
                </span>
              </span>
              <button
                className="btn sm"
                disabled={assign.isPending}
                onClick={() => assign.mutate(g.userId)}
              >
                Attribuer
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Fermer
        </button>
      </div>
    </dialog>
  );
}
