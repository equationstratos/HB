import { LOW_RATING_MIN_COUNT, LOW_RATING_THRESHOLD } from '@hb/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Empty, ErrorBox, Loading, Stars } from '../components/ui';
import { api } from '../lib/client';
import { fmtDateTime, fullName } from '../lib/format';

export function RatingsPage() {
  const low = useQuery({ queryKey: ['ratings', 'low'], queryFn: api.admin.lowRated });
  const best = useQuery({
    queryKey: ['guards', 'APPROVED', 'all'],
    queryFn: () => api.admin.guards({ status: ['APPROVED'], pageSize: 100 }),
  });
  const ranked = [...(best.data?.items ?? [])]
    .filter((g) => g.ratingCount > 0)
    .sort((a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Notes des gardes</h1>
          <p className="muted">
            Les gardes sous {String(LOW_RATING_THRESHOLD).replace('.', ',')}/5 (à partir de{' '}
            {LOW_RATING_MIN_COUNT} avis) sont signalés ici.
          </p>
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>À examiner</h3>
          </div>
          <ErrorBox error={low.error} />
          {low.isLoading && <Loading />}
          {low.data?.length === 0 && <Empty>Aucun garde sous le seuil. 👍</Empty>}
          {low.data?.map((g) => (
            <div key={g.guard.id} className="alert-item">
              <div className="row">
                <Link to={`/guards/${g.guard.id}`}>
                  <strong>{fullName(g.guard)}</strong>
                </Link>
                <span className="spacer" />
                <Stars value={g.ratingAvg} />
                <span className="muted small">({g.ratingCount})</span>
              </div>
              {g.recent.map((r) => (
                <span key={r.id} className="small">
                  {'★'.repeat(r.score)} <span className="muted">{fmtDateTime(r.createdAt)}</span>{' '}
                  {r.comment && `— « ${r.comment} »`}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-header">
            <h3>Classement</h3>
          </div>
          {best.isLoading && <Loading />}
          {ranked.length === 0 && !best.isLoading && <Empty>Pas encore de notes.</Empty>}
          {ranked.length > 0 && (
            <table className="table">
              <tbody>
                {ranked.map((g, i) => (
                  <tr key={g.userId}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      <Link to={`/guards/${g.userId}`}>{fullName(g.user)}</Link>
                    </td>
                    <td>
                      <Stars value={g.ratingAvg} />
                    </td>
                    <td className="muted small">{g.ratingCount} avis</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
