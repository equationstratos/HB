import { roleLabel, type Role } from '@hb/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Badge,
  Empty,
  ErrorBox,
  GuardStatusBadge,
  Loading,
  Pagination,
  ReasonDialog,
} from '../components/ui';
import { api } from '../lib/client';
import { fmtDateTime, fullName } from '../lib/format';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toasts';

export function UsersPage() {
  const { user: me } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [role, setRole] = useState<Role | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [suspending, setSuspending] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['users', role, q, page],
    queryFn: () =>
      api.admin.users({ role: role || undefined, q: q || undefined, page, pageSize: 20 }),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['users'] });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Utilisateurs</h1>
          <p className="muted">
            Clientes, gardes et équipe. La suspension coupe immédiatement toutes les sessions.
          </p>
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <div className="chips">
          {(['', 'CLIENT', 'GUARD', 'ADMIN'] as const).map((r) => (
            <button
              key={r}
              className={`chip${role === r ? ' active' : ''}`}
              onClick={() => {
                setRole(r);
                setPage(1);
              }}
            >
              {r ? roleLabel[r] : 'Tous'}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Nom, email ou téléphone"
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
                    <th>Nom</th>
                    <th>Rôle</th>
                    <th>Téléphone</th>
                    <th>Protections</th>
                    <th>Inscription</th>
                    <th>Compte</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div>{fullName(u)}</div>
                        <div className="small muted">{u.email}</div>
                      </td>
                      <td>
                        <div className="row">
                          {roleLabel[u.role]}{' '}
                          {u.guardStatus && <GuardStatusBadge status={u.guardStatus} />}
                          {u.mfaEnabled && <Badge tone="info">2FA</Badge>}
                        </div>
                      </td>
                      <td>
                        {u.phone} {u.phoneVerified ? '' : <Badge tone="warning">non vérifié</Badge>}
                      </td>
                      <td>{u.missionsCount}</td>
                      <td>{fmtDateTime(u.createdAt)}</td>
                      <td>
                        {u.status === 'ACTIVE' ? (
                          <Badge tone="success">Actif</Badge>
                        ) : (
                          <Badge tone="danger">Suspendu</Badge>
                        )}
                      </td>
                      <td>
                        {u.id !== me?.id &&
                          (u.status === 'ACTIVE' ? (
                            <button className="btn sm" onClick={() => setSuspending(u.id)}>
                              Suspendre
                            </button>
                          ) : (
                            <button
                              className="btn sm"
                              onClick={() =>
                                void api.admin.reactivateUser(u.id).then(() => {
                                  toast({ tone: 'success', title: 'Compte réactivé' });
                                  refresh();
                                })
                              }
                            >
                              Réactiver
                            </button>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={query.data.total} onPage={setPage} />
          </>
        ) : (
          <Empty>Aucun utilisateur.</Empty>
        )}
      </div>
      <ReasonDialog
        open={!!suspending}
        title="Suspendre ce compte"
        description="Toutes les sessions sont révoquées et les connexions temps réel coupées."
        confirmLabel="Suspendre"
        danger
        onClose={() => setSuspending(null)}
        onConfirm={async (reason) => {
          if (!suspending) return;
          await api.admin.suspendUser(suspending, reason);
          toast({ tone: 'success', title: 'Compte suspendu' });
          refresh();
        }}
      />
    </div>
  );
}
