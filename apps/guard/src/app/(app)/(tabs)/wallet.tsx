import { errorMessage } from '@hb/api-client';
import {
  Badge,
  Banner,
  Button,
  Card,
  ErrorText,
  Field,
  fmtDateTime,
  fmtTime,
  Row,
  T,
  useApi,
  useSocketEvent,
  useTheme,
  type Tone,
} from '@hb/mobile-core';
import {
  bankAccountSchema,
  formatDuration,
  formatPrice,
  payoutStatusLabel,
  type BankAccountDto,
  type BankAccountInput,
  type GuardEarningDto,
  type PayoutDto,
  type PayoutStatus,
} from '@hb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const payoutTone: Record<PayoutStatus, Tone> = {
  REQUESTED: 'warning',
  PAID: 'success',
  REJECTED: 'danger',
};
const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/** Gains du garde : solde disponible, virement vers son compte, historique. */
export default function Wallet() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { colors, spacing, fontSize } = useTheme();
  const wallet = useQuery({ queryKey: ['guard', 'wallet'], queryFn: () => api.guards.wallet() });
  const [info, setInfo] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['guard', 'wallet'] });

  // Une mission terminée crédite aussitôt le solde ; l'équipe paie ou refuse un virement.
  useSocketEvent('mission:updated', (m) => {
    if (m.status === 'COMPLETED') void refresh();
  });
  useSocketEvent('payout:updated', () => void refresh());

  const payout = useMutation({
    mutationFn: () => api.guards.requestPayout(),
    onSuccess: () => {
      setInfo(t('wallet.requested'));
      void refresh();
    },
    // Refus du serveur (solde ou demande changés entre-temps) : on affiche l'état à jour.
    onError: () => void refresh(),
  });

  const w = wallet.data;
  const pending = w?.pendingPayout ?? null;
  // Pourquoi le virement est impossible (une demande en cours a son propre bandeau).
  const blocked = !w
    ? null
    : !w.bankAccount
      ? t('wallet.noAccount')
      : w.availableCents < w.payoutMinCents
        ? t('wallet.belowMin', { amount: formatPrice(w.payoutMinCents) })
        : null;

  // Étape de confirmation : le virement porte sur tout le solde.
  const confirmTransfer = () => {
    if (!w?.bankAccount) return;
    setInfo(null);
    Alert.alert(
      t('wallet.confirmTitle', { amount: formatPrice(w.availableCents) }),
      t('wallet.confirmMessage', {
        iban: w.bankAccount.ibanMasked,
        holder: w.bankAccount.holderName,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('wallet.confirm'), onPress: () => payout.mutate() },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={wallet.isRefetching} onRefresh={() => void refresh()} />
        }
      >
        <T variant="title">{t('wallet.title')}</T>
        <ErrorText error={wallet.error ? errorMessage(wallet.error) : null} />

        <Card style={{ gap: spacing.md }}>
          <View style={{ gap: 2 }}>
            <T variant="muted">{t('wallet.available')}</T>
            <T variant="title" style={{ fontSize: fontSize.xxl }}>
              {w ? formatPrice(w.availableCents) : '—'}
            </T>
            {w && (
              <T variant="small">
                {t('wallet.totalEarned', { amount: formatPrice(w.totalEarnedCents) })}
              </T>
            )}
          </View>
          <Button
            title={t('wallet.transfer')}
            icon="arrow-up-circle"
            disabled={!w || !!pending || !!blocked}
            loading={payout.isPending}
            onPress={confirmTransfer}
          />
          {pending ? (
            <Banner
              tone="warning"
              icon="time"
              title={t('wallet.pending', { amount: formatPrice(pending.amountCents) })}
              message={t('wallet.pendingHint', {
                date: fmtDateTime(pending.requestedAt),
                iban: pending.ibanMasked,
              })}
            />
          ) : (
            blocked && <T variant="muted">{blocked}</T>
          )}
          <ErrorText error={payout.error ? errorMessage(payout.error) : null} />
        </Card>

        {info && <Banner tone="success" icon="checkmark-circle" title={info} />}

        {w && <BankAccountCard account={w.bankAccount} onSaved={setInfo} />}

        <T variant="heading">{t('wallet.payouts')}</T>
        <Card>
          {(w?.payouts ?? []).length === 0 && <T variant="muted">{t('wallet.noPayouts')}</T>}
          {w?.payouts.map((p, i) => (
            <PayoutRow key={p.id} payout={p} first={i === 0} />
          ))}
        </Card>

        <T variant="heading">{t('wallet.earnings')}</T>
        {w && (
          <T variant="muted">
            {t('wallet.rule', {
              rate: formatPrice(w.hourlyRateCents),
              minutes: w.minBilledMinutes,
            })}
          </T>
        )}
        <Card>
          {(w?.earnings ?? []).length === 0 && <T variant="muted">{t('wallet.noEarnings')}</T>}
          {w?.earnings.map((e, i) => (
            <EarningRow key={e.id} earning={e} first={i === 0} />
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Compte de destination : IBAN masqué, ajout ou modification avec contrôle à la saisie. */
function BankAccountCard({
  account,
  onSaved,
}: {
  account: BankAccountDto | null;
  onSaved: (message: string) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ holderName: '', iban: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof BankAccountInput, string>>>({});
  const save = useMutation({
    mutationFn: (input: BankAccountInput) => api.guards.setBankAccount(input),
    onSuccess: () => {
      setEditing(false);
      setForm({ holderName: '', iban: '' });
      onSaved(t('wallet.bankSaved'));
      void queryClient.invalidateQueries({ queryKey: ['guard', 'wallet'] });
    },
  });

  const open = () => {
    setForm({ holderName: account?.holderName ?? '', iban: '' });
    setErrors({});
    save.reset();
    setEditing(true);
  };

  const submit = () => {
    const parsed = bankAccountSchema.safeParse(form);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof BankAccountInput;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  return (
    <Card>
      <Row>
        <T variant="heading" style={{ flex: 1 }}>
          {t('wallet.bankTitle')}
        </T>
        {!editing && (
          <Button
            title={account ? t('wallet.bankEdit') : t('wallet.bankAdd')}
            icon={account ? 'create-outline' : 'add'}
            variant="ghost"
            small
            onPress={open}
          />
        )}
      </Row>
      {!editing &&
        (account ? (
          <View style={{ gap: 2 }}>
            <T variant="label">{account.holderName}</T>
            <T variant="muted">{account.ibanMasked}</T>
          </View>
        ) : (
          <T variant="muted">{t('wallet.bankNone')}</T>
        ))}
      {editing && (
        <View style={{ gap: 12 }}>
          <Field
            label={t('wallet.holder')}
            value={form.holderName}
            onChangeText={(holderName) => setForm({ ...form, holderName })}
            autoComplete="name"
            error={errors.holderName}
            hint={t('wallet.holderHint')}
          />
          <Field
            label={t('wallet.iban')}
            value={form.iban}
            onChangeText={(iban) => setForm({ ...form, iban })}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="FR76 3000 6000 0000 0000 0000 000"
            error={errors.iban}
            hint={t('wallet.ibanHint')}
          />
          <ErrorText error={save.error ? errorMessage(save.error) : null} />
          <Row>
            <Button
              title={t('common.cancel')}
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => setEditing(false)}
            />
            <Button
              title={t('wallet.bankSave')}
              icon="save"
              style={{ flex: 1 }}
              loading={save.isPending}
              onPress={submit}
            />
          </Row>
        </View>
      )}
    </Card>
  );
}

function PayoutRow({ payout: p, first }: { payout: PayoutDto; first: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopColor: colors.border }]}>
      <Row>
        <T variant="label" style={{ flex: 1 }}>
          {formatPrice(p.amountCents)}
        </T>
        <Badge label={payoutStatusLabel[p.status]} tone={payoutTone[p.status]} />
      </Row>
      <T variant="small">
        {t('wallet.requestedOn', { date: fmtDateTime(p.requestedAt) })} · {p.ibanMasked}
      </T>
      {p.status === 'PAID' && (
        <T variant="small">
          {t('wallet.paidOn', { date: fmtDateTime(p.processedAt) })}
          {p.bankReference ? ` · ${t('wallet.reference', { reference: p.bankReference })}` : ''}
        </T>
      )}
      {p.status === 'REJECTED' && (
        <T variant="small" style={{ color: colors.danger }}>
          {t('wallet.rejectedOn', {
            date: fmtDateTime(p.processedAt),
            reason: p.rejectionReason ?? '',
          })}
        </T>
      )}
    </View>
  );
}

/** Une mission rémunérée : horaires et montant, sans rien sur la cliente. */
function EarningRow({ earning: e, first }: { earning: GuardEarningDto; first: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopColor: colors.border }]}>
      <Row>
        <T variant="label" style={{ flex: 1 }}>
          {day.format(new Date(e.startedAt))}
        </T>
        <T variant="label">{formatPrice(e.amountCents)}</T>
      </Row>
      <T variant="small">
        {t('wallet.start')} {fmtTime(e.startedAt)} · {t('wallet.duration')}{' '}
        {formatDuration(e.durationMinutes * 60)} · {t('wallet.end')} {fmtTime(e.endedAt)}
      </T>
      {e.billedMinutes > e.durationMinutes && (
        <T variant="small">{t('wallet.billed', { minutes: e.billedMinutes })}</T>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 2,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
});
