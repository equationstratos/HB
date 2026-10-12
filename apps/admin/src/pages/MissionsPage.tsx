import { missionTypeLabel, transportModeLabel, type MissionStatus } from '@hb/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Empty, ErrorBox, Loading, MissionStatusBadge, Pagination } from '../components/ui';
import { api } from '../lib/client';
import { fmtDateTime, fullName } from '../lib/format';

const FILTERS: { key: string; label: string; status?: MissionStatus[] }[] = [
  { key: 'upcoming', label: 'À venir', status: ['SEARCHING', 'ASSIGNED', 'UNASSIGNED'] },
  { key: 'active', label: 'En cours', status: ['GUARD_EN_ROUTE', 'IN_PROGRESS'] },
  { key: 'unassigned', label: 'Sans garde', status: ['UNASSIGNED'] },
  { key: 'done', label: 'Terminées', status: ['COMPLETED'] },
  { key: 'cancelled', label: 'Annulées', status: ['CANCELLED'] },
  { key: 'all', label: 'Toutes' },
];

/** Protections en cours et à venir, et historique. */
export function MissionsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('upcoming');
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const status = FILTERS.find((f) => f.key === filter)?.status;
  const query = useQuery({
    queryKey: ['missions', filter, page, from, to],
    queryFn: () =>
      api.admin.missions({
        status,
        page,
        pageSize: 20,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      }),
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Protections</h1>
          <p className="muted">
            Réservations en cours, à venir et passées, avec leur trajet surveillé.
          </p>
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip${filter === f.key ? ' active' : ''}`}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <label className="row small">
          Du
          <input
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="row small">
          au
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
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
                    <th>Départ</th>
                    <th>Cliente</th>
                    <th>Trajet</th>
                    <th>Garde</th>
                    <th>Type</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((m) => {
                    const first = m.route.waypoints[0];
                    const last = m.route.waypoints[m.route.waypoints.length - 1];
                    return (
                      <tr
                        key={m.id}
                        className="clickable"
                        onClick={() => navigate(`/missions/${m.id}`)}
                      >
                        <td>{fmtDateTime(m.departureAt)}</td>
                        <td>{fullName(m.client)}</td>
                        <td>
                          <div>{transportModeLabel[m.route.mode]}</div>
                          <div className="small muted">
                            {first?.address ?? 'Départ'} → {last?.address ?? 'Arrivée'}
                          </div>
                        </td>
                        <td>{m.guard ? fullName(m.guard) : <span className="muted">—</span>}</td>
                        <td>{missionTypeLabel[m.type]}</td>
                        <td>
                          <MissionStatusBadge status={m.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={query.data.total} onPage={setPage} />
          </>
        ) : (
          <Empty>Aucune protection pour ce filtre.</Empty>
        )}
      </div>
    </div>
  );
}
