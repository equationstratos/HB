import { roleLabel } from '@hb/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Empty, ErrorBox, Loading, Pagination } from '../components/ui';
import { api } from '../lib/client';
import { fmtDateTime } from '../lib/format';

const PRESETS = [
  { label: 'Tout', action: '' },
  { label: 'Connexions', action: 'auth.' },
  { label: 'Missions', action: 'mission.' },
  { label: 'SOS', action: 'sos.' },
  { label: 'Écarts', action: 'deviation.' },
  { label: 'Gardes', action: 'guard.' },
  { label: 'Comptes', action: 'user.' },
];

/** Traçabilité : qui a fait quoi, quand et d'où. Entrées non modifiables. */
export function AuditPage() {
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['audit', action, entityId, page],
    queryFn: () =>
      api.admin.audit({
        action: action || undefined,
        entityId: entityId || undefined,
        page,
        pageSize: 30,
      }),
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Journal d’audit</h1>
          <p className="muted">
            Toutes les actions sensibles, horodatées. Le journal est en ajout seul : aucune entrée
            ne peut être modifiée ni supprimée.
          </p>
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <div className="chips">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`chip${action === p.action ? ' active' : ''}`}
              onClick={() => {
                setAction(p.action);
                setPage(1);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Identifiant d’entité (mission, garde…)"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value.trim())}
        />
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
                    <th>Date</th>
                    <th>Action</th>
                    <th>Acteur</th>
                    <th>Entité</th>
                    <th>Origine</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((e) => (
                    <tr
                      key={e.id}
                      className="clickable"
                      onClick={() => setOpen(open === e.id ? null : e.id)}
                    >
                      <td className="small">{fmtDateTime(e.createdAt)}</td>
                      <td>
                        <span className="mono">{e.action}</span>
                        {open === e.id && e.metadata && (
                          <pre
                            className="mono small muted"
                            style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}
                          >
                            {JSON.stringify(e.metadata, null, 2)}
                          </pre>
                        )}
                      </td>
                      <td>
                        {e.actorRole === 'SYSTEM' ? (
                          <Badge tone="info">Système</Badge>
                        ) : (
                          <>
                            <div className="small">{e.actorEmail ?? '—'}</div>
                            {e.actorRole && (
                              <span className="small muted">{roleLabel[e.actorRole]}</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="small">
                        {e.entityType ?? '—'}{' '}
                        <span className="mono muted">{e.entityId?.slice(0, 10)}</span>
                      </td>
                      <td className="small muted" title={e.userAgent ?? ''}>
                        {e.ip ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={30} total={query.data.total} onPage={setPage} />
          </>
        ) : (
          <Empty>Aucune entrée.</Empty>
        )}
      </div>
    </div>
  );
}
