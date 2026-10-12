import { errorMessage } from '@hb/api-client';
import { Banner, Button, Card, ErrorText, Row, Screen, T, useApi, useTheme } from '@hb/mobile-core';
import { formatPrice } from '@hb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

/** Formules d'abonnement — sans paiement en v1. */
export default function Subscription() {
  const { t } = useTranslation();
  const api = useApi();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.plans.list() });
  const mine = useQuery({ queryKey: ['subscription'], queryFn: () => api.subscriptions.mine() });
  const sub = mine.data?.subscription ?? null;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['subscription'] });
  const subscribe = useMutation({
    mutationFn: (planId: string) => api.subscriptions.subscribe(planId),
    onSuccess: refresh,
  });
  const cancel = useMutation({ mutationFn: () => api.subscriptions.cancel(), onSuccess: refresh });

  return (
    <Screen edges={['left', 'right']}>
      <Banner tone="primary" icon="gift" title={t('subscription.paymentSoon')} />
      {sub && (
        <Card style={{ borderColor: colors.primary, borderWidth: 2 }}>
          <T variant="heading">{t('subscription.current', { plan: sub.plan.name })}</T>
          <T variant="muted">
            {t('subscription.usage', { used: sub.missionsUsed, total: sub.plan.missionsPerMonth })}
          </T>
          <Button
            title={t('subscription.cancelSub')}
            variant="ghost"
            small
            loading={cancel.isPending}
            onPress={() => cancel.mutate()}
          />
        </Card>
      )}
      {plans.data?.map((p) => (
        <Card key={p.id}>
          <Row>
            <T variant="heading" style={{ flex: 1 }}>
              {p.name}
            </T>
            <T variant="label">{formatPrice(p.priceCents)} / mois</T>
          </Row>
          <T variant="muted">
            {p.description ?? t('subscription.perMonth', { count: p.missionsPerMonth })}
          </T>
          {sub?.plan.id !== p.id && (
            <Button
              title={sub ? t('subscription.change') : t('subscription.choose')}
              small
              variant={sub ? 'secondary' : 'primary'}
              loading={subscribe.isPending && subscribe.variables === p.id}
              onPress={() => subscribe.mutate(p.id)}
            />
          )}
        </Card>
      ))}
      <ErrorText
        error={
          subscribe.error
            ? errorMessage(subscribe.error)
            : cancel.error
              ? errorMessage(cancel.error)
              : null
        }
      />
    </Screen>
  );
}
