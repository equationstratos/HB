import { GuardBankAccount, GuardEarning, GuardPayout, Prisma, User } from '@prisma/client';
import { AdminPayoutDto, BankAccountDto, GuardEarningDto, maskIban, PayoutDto } from '@hb/shared';
import { iso } from '../common/iso';

export function toEarningDto(e: GuardEarning): GuardEarningDto {
  return {
    id: e.id,
    missionId: e.missionId,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt.toISOString(),
    durationMinutes: Math.max(0, Math.ceil((e.endedAt.getTime() - e.startedAt.getTime()) / 60_000)),
    billedMinutes: e.billedMinutes,
    hourlyRateCents: e.hourlyRateCents,
    amountCents: e.amountCents,
  };
}

/** Jamais l'IBAN complet : seulement sa version masquée. */
export function toBankAccountDto(a: GuardBankAccount): BankAccountDto {
  return {
    holderName: a.holderName,
    ibanMasked: maskIban(a.ibanPrefix, a.ibanLast4),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function toPayoutDto(p: GuardPayout): PayoutDto {
  return {
    id: p.id,
    amountCents: p.amountCents,
    status: p.status,
    holderName: p.holderName,
    ibanMasked: maskIban(p.ibanPrefix, p.ibanLast4),
    requestedAt: p.requestedAt.toISOString(),
    processedAt: iso(p.processedAt),
    bankReference: p.bankReference,
    rejectionReason: p.rejectionReason,
  };
}

export type PayoutWithGuard = GuardPayout & {
  guard: { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> };
};

export const payoutGuardInclude = {
  guard: {
    select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  },
} satisfies Prisma.GuardPayoutInclude;

export function toAdminPayoutDto(p: PayoutWithGuard): AdminPayoutDto {
  return { ...toPayoutDto(p), guard: p.guard.user };
}
