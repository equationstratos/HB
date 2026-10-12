import { errorMessage } from '@hb/api-client';
import { formatPrice, ONE_OFF_PRICE_CENTS, type PlanDto } from '@hb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, Empty, ErrorBox, Loading, Pagination } from '../components/ui';
import { api } from '../lib/client';
import { fmtDateTime } from '../lib/format';
import { useToast } from '../lib/toasts';

export function PlansPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.admin.plans });
  const subs = useQuery({
    queryKey: ['subscriptions', page],
    queryFn: () => api.admin.subscriptions({ page, pageSize: 20 }),
  });
  const toggle = useMutation({
    mutationFn: (p: PlanDto) => api.admin.updatePlan(p.id, { active: !p.active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['plans'] }),
    onError: (e) =>
      toast({ tone: 'danger', title: 'Modification impossible', body: errorMessage(e) }),
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Formules et abonnements</h1>
          <p className="muted">
            Protection ponctuelle sans abonnement : {formatPrice(ONE_OFF_PRICE_CENTS)}. Paiement en
            ligne non activé en v1 : les prix sont indicatifs.
          </p>
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Formules</h3>
          </div>
          <ErrorBox error={plans.error} />
          {plans.isLoading && <Loading />}
          {plans.data && (
            <table className="table">
              <thead>
                <tr>
                  <th>Formule</th>
                  <th>Quota</th>
                  <th>Prix</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {plans.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div>{p.name}</div>
                      <div className="small muted">{p.description}</div>
                    </td>
                    <td>{p.missionsPerMonth} / mois</td>
                    <td>{formatPrice(p.priceCents)}</td>
                    <td>
                      <button
                        className="btn sm"
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate(p)}
                      >
                        {p.active ? 'Désactiver' : 'Activer'}
                      </button>{' '}
                      {p.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <NewPlanForm />
        </div>
        <div className="card">
          <div className="card-header">
            <h3>Abonnements</h3>
          </div>
          {subs.isLoading && <Loading />}
          {subs.data?.items.length === 0 && <Empty>Aucun abonnement.</Empty>}
          {subs.data && subs.data.items.length > 0 && (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Formule</th>
                    <th>Consommé</th>
                    <th>Période</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.data.items.map((s) => (
                    <tr key={s.id}>
                      <td>{s.clientName}</td>
                      <td>
                        {s.plan.name} {s.status === 'CANCELLED' && <Badge>Résilié</Badge>}
                      </td>
                      <td>
                        {s.missionsUsed} / {s.plan.missionsPerMonth}
                      </td>
                      <td className="small">jusqu’au {fmtDateTime(s.currentPeriodEnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} pageSize={20} total={subs.data.total} onPage={setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NewPlanForm() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    missionsPerMonth: 4,
    price: '39',
  });
  const create = useMutation({
    mutationFn: () =>
      api.admin.createPlan({
        code: form.code,
        name: form.name,
        description: form.description || undefined,
        missionsPerMonth: Number(form.missionsPerMonth),
        priceCents: Math.round(Number(form.price.replace(',', '.')) * 100),
        active: true,
      }),
    onSuccess: () => {
      setForm({ code: '', name: '', description: '', missionsPerMonth: 4, price: '39' });
      void queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <form
      className="card-body stack"
      onSubmit={submit}
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <strong>Nouvelle formule</strong>
      <div className="grid-2">
        <input
          className="input"
          placeholder="Code (ex. nuit-plus)"
          required
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <input
          className="input"
          placeholder="Nom affiché"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="input"
          type="number"
          min={1}
          placeholder="Protections par mois"
          value={form.missionsPerMonth}
          onChange={(e) => setForm({ ...form, missionsPerMonth: Number(e.target.value) })}
        />
        <input
          className="input"
          placeholder="Prix mensuel (€)"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
      </div>
      <input
        className="input"
        placeholder="Description"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <ErrorBox error={create.error} />
      <div>
        <button className="btn primary" disabled={create.isPending}>
          <Plus size={15} /> Créer la formule
        </button>
      </div>
    </form>
  );
}
