import { errorMessage } from '@hb/api-client';
import {
  deviationTypeLabel,
  formatDistance,
  formatDuration,
  missionStatusLabel,
  transportModeLabel,
  type DeviationDto,
  type LiveMissionDto,
  type MissionDto,
  type SosAlertDto,
} from '@hb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Siren, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { MissionMap, type MapMission } from '../components/MissionMap';
import { AlertStatusBadge, Empty, ErrorBox, Loading, MissionStatusBadge } from '../components/ui';
import { api } from '../lib/client';
import { fmtAgo, fmtTime, fullName } from '../lib/format';
import { useRealtime } from '../lib/realtime';
import { useToast } from '../lib/toasts';

/** Supervision en direct : carte des protections en cours et alertes. */
export function LivePage() {
  const { positions } = useRealtime();
  const [selected, setSelected] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: api.admin.overview,
    refetchInterval: 30_000,
  });
  const live = useQuery({ queryKey: ['live'], queryFn: api.admin.live, refetchInterval: 60_000 });
  const alerts = useQuery({
    queryKey: ['alerts'],
    queryFn: api.admin.alerts,
    refetchInterval: 30_000,
  });

  const missions = live.data ?? [];
  const alertMissionIds = new Set([
    ...(alerts.data?.sos ?? []).map((a) => a.missionId),
    ...(alerts.data?.deviations ?? []).map((d) => d.missionId),
  ]);
  const mapMissions: MapMission[] = missions.map((m) => ({
    id: m.id,
    label: `${m.client.firstName} ${m.client.lastName.charAt(0)}.`,
    route: m.route,
    client: positions[m.id]?.client ?? m.lastClientLocation,
    guard: positions[m.id]?.guard ?? m.lastGuardLocation,
    alert: alertMissionIds.has(m.id),
    selected: m.id === selected,
  }));
  const o = overview.data;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Supervision en direct</h1>
          <p className="muted">
            Protections en cours, positions et alertes, mises à jour en temps réel.
          </p>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Protections en cours" value={o?.activeMissions} />
        <Kpi label="À venir (attribuées ou en recherche)" value={o?.upcomingMissions} />
        <Kpi
          label="Sans garde"
          value={o?.unassignedMissions}
          tone={o?.unassignedMissions ? 'warn' : undefined}
        />
        <Kpi label="SOS ouverts" value={o?.openSos} tone={o?.openSos ? 'alert' : undefined} />
        <Kpi
          label="Écarts de trajet ouverts"
          value={o?.openDeviations}
          tone={o?.openDeviations ? 'warn' : undefined}
        />
        <Kpi
          label="Gardes disponibles"
          value={o ? `${o.availableGuards} / ${o.approvedGuards}` : undefined}
        />
      </div>

      <div className="live">
        <div className="card map-card">
          {live.isLoading ? (
            <Loading />
          ) : (
            <MissionMap missions={mapMissions} onSelect={setSelected} />
          )}
          <div className="map-legend">
            <span>
              <span className="legend-line" />
              Trajet prévu
            </span>
            <span>
              <span className="legend-swatch" style={{ background: 'var(--client)' }} />
              Cliente
            </span>
            <span>
              <span className="legend-swatch" style={{ background: 'var(--guard)' }} />
              Garde
            </span>
            <span>
              <span className="legend-swatch" style={{ background: 'var(--danger)' }} />
              Alerte
            </span>
          </div>
        </div>

        <div className="side-panel">
          <AlertsPanel
            sos={alerts.data?.sos ?? []}
            deviations={alerts.data?.deviations ?? []}
            onSelect={setSelected}
          />
          <div className="card">
            <div className="card-header">
              <h3>Protections actives</h3>
              <span className="badge">{missions.length}</span>
            </div>
            {live.error && <ErrorBox error={live.error} />}
            {missions.length === 0 && !live.isLoading && <Empty>Aucune protection en cours.</Empty>}
            {missions.map((m) => (
              <MissionRow
                key={m.id}
                mission={m}
                selected={m.id === selected}
                onSelect={() => setSelected(m.id === selected ? null : m.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string | undefined;
  tone?: 'alert' | 'warn';
}) {
  return (
    <div className={`card kpi ${tone ?? ''}`}>
      <span className="muted small">{label}</span>
      <span className="value">{value ?? '—'}</span>
    </div>
  );
}

function MissionRow({
  mission: m,
  selected,
  onSelect,
}: {
  mission: LiveMissionDto;
  selected: boolean;
  onSelect: () => void;
}) {
  const alert = m.openSos.length > 0 || m.openDeviations.length > 0;
  return (
    <div className={`mission-item${selected ? ' selected' : ''}`} onClick={onSelect}>
      <div className="row">
        <strong>{fullName(m.client)}</strong>
        {alert && <TriangleAlert size={15} color="var(--danger)" />}
        <span className="spacer" />
        <MissionStatusBadge status={m.status} />
      </div>
      <span className="small muted">
        Garde : {fullName(m.guard)} · {transportModeLabel[m.route.mode]} ·{' '}
        {formatDistance(m.route.distanceMeters)} · {formatDuration(m.route.durationSeconds)}
      </span>
      <span className="small muted">
        Arrivée prévue {fmtTime(m.route.expectedArrivalAt)} · mot de code{' '}
        <strong>{m.codeWord}</strong>
      </span>
      {selected && (
        <div className="row" style={{ marginTop: 6 }}>
          <Link className="btn sm" to={`/missions/${m.id}`} onClick={(e) => e.stopPropagation()}>
            Ouvrir la fiche
          </Link>
        </div>
      )}
    </div>
  );
}

function AlertsPanel({
  sos,
  deviations,
  onSelect,
}: {
  sos: (SosAlertDto & { mission: MissionDto })[];
  deviations: (DeviationDto & { mission: MissionDto })[];
  onSelect: (missionId: string) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    void queryClient.invalidateQueries({ queryKey: ['overview'] });
    void queryClient.invalidateQueries({ queryKey: ['live'] });
  };
  const action = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError: (e) => toast({ tone: 'danger', title: 'Action impossible', body: errorMessage(e) }),
  });
  const count = sos.length + deviations.length;

  return (
    <div className="card">
      <div className="card-header">
        <Siren size={17} color={count ? 'var(--danger)' : undefined} />
        <h3>Alertes</h3>
        <span className={`badge ${count ? 'danger' : ''}`}>{count}</span>
      </div>
      {count === 0 && <Empty>Aucune alerte en cours. Tout va bien.</Empty>}
      {sos.map((a) => (
        <div key={a.id} className={`alert-item sos ${a.status === 'ACKNOWLEDGED' ? 'ack' : ''}`}>
          <div className="row">
            <strong style={{ color: 'var(--danger)' }}>SOS</strong>
            <span>{fullName(a.mission.client)}</span>
            <span className="spacer" />
            <AlertStatusBadge status={a.status} />
          </div>
          {a.message && <span className="small">{a.message}</span>}
          <span className="small muted">
            {fmtAgo(a.createdAt)} · garde {fullName(a.mission.guard)} ·{' '}
            {missionStatusLabel[a.mission.status]}
          </span>
          <div className="row wrap">
            <button className="btn sm" onClick={() => onSelect(a.missionId)}>
              Localiser
            </button>
            {a.status === 'OPEN' && (
              <button
                className="btn sm primary"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(() =>
                    api.sos.acknowledge(a.id, 'Pris en charge par la supervision'),
                  )
                }
              >
                Prendre en charge
              </button>
            )}
            <button
              className="btn sm"
              disabled={action.isPending}
              onClick={() => action.mutate(() => api.sos.resolve(a.id))}
            >
              Clôturer
            </button>
            <Link className="btn sm ghost" to={`/missions/${a.missionId}`}>
              <Phone size={13} /> Fiche
            </Link>
          </div>
        </div>
      ))}
      {deviations.map((d) => (
        <div key={d.id} className={`alert-item ${d.status === 'ACKNOWLEDGED' ? 'ack' : ''}`}>
          <div className="row">
            <strong style={{ color: 'var(--warning)' }}>{deviationTypeLabel[d.type]}</strong>
            <span>{fullName(d.mission.client)}</span>
            <span className="spacer" />
            <AlertStatusBadge status={d.status} />
          </div>
          <span className="small muted">
            {fmtAgo(d.createdAt)}
            {d.distanceMeters ? ` · à ${formatDistance(d.distanceMeters)} du trajet` : ''}
            {d.clientConfirmedOk === false ? ' · la cliente demande de l’aide' : ''}
            {d.clientConfirmedOk === null ? ' · pas encore de réponse de la cliente' : ''}
          </span>
          <div className="row wrap">
            <button className="btn sm" onClick={() => onSelect(d.missionId)}>
              Localiser
            </button>
            {d.status === 'OPEN' && (
              <button
                className="btn sm primary"
                disabled={action.isPending}
                onClick={() => action.mutate(() => api.deviations.acknowledge(d.id))}
              >
                Prendre en charge
              </button>
            )}
            <button
              className="btn sm"
              disabled={action.isPending}
              onClick={() => action.mutate(() => api.deviations.resolve(d.id))}
            >
              Clôturer
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
