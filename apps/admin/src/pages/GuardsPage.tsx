import type { GuardStatus } from '@hb/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Empty, ErrorBox, GuardStatusBadge, Loading, Pagination, Stars } from '../components/ui';
import { api } from '../lib/client';
import { fmtDateTime, fullName } from '../lib/format';

const TABS: { key: GuardStatus; label: string }[] = [
  { key: 'PENDING', label: 'À valider' },
  { key: 'APPROVED', label: 'Validés' },
  { key: 'REJECTED', label: 'Refusés' },
  { key: 'SUSPENDED', label: 'Suspendus' },
  { key: 'DRAFT', label: 'Candidatures incomplètes' },
];

export function GuardsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<GuardStatus>('PENDING');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['guards', status, q, page],
    queryFn: () => api.admin.guards({ status: [status], q: q || undefined, page, pageSize: 20 }),
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Gardes</h1>
          <p className="muted">
            Inscription libre, activation uniquement après vérification de l’identité et de la carte
            professionnelle CNAPS.
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
        <span className="spacer" />
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Rechercher (nom, email)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
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
                    <th>Garde</th>
                    <th>Carte CNAPS</th>
                    <th>Documents</th>
                    <th>Candidature</th>
                    <th>Note</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((g) => (
                    <tr
                      key={g.userId}
                      className="clickable"
                      onClick={() => navigate(`/guards/${g.userId}`)}
                    >
                      <td>
                        <div>{fullName(g.user)}</div>
                        <div className="small muted">{g.user.email}</div>
                      </td>
                      <td className="mono">{g.cnapsCardNumber ?? '—'}</td>
                      <td>{g.documents.length}</td>
                      <td>{fmtDateTime(g.submittedAt)}</td>
                      <td>
                        <Stars value={g.ratingAvg} />
                      </td>
                      <td>
                        <GuardStatusBadge status={g.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={query.data.total} onPage={setPage} />
          </>
        ) : (
          <Empty>Aucun garde dans cette catégorie.</Empty>
        )}
      </div>
    </div>
  );
}
