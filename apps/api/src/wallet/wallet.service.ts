import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AdminPayoutDetailDto,
  AdminPayoutDto,
  BankAccountDto,
  BankAccountInput,
  formatIban,
  EarningRule,
  formatPrice,
  GuardWalletDto,
  maskIban,
  missionEarning,
  Paginated,
  PayoutDto,
  PayoutListQuery,
} from '@hb/shared';
import { AuditService } from '../audit/audit.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CryptoService } from '../common/crypto.service';
import { AppConfig } from '../config/app-config.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  payoutGuardInclude,
  PayoutWithGuard,
  toAdminPayoutDto,
  toBankAccountDto,
  toEarningDto,
  toPayoutDto,
} from './wallet.mapper';

/** Mission qui vient d'être terminée : de quoi calculer le gain du garde. */
export interface CompletedMission {
  id: string;
  guardId: string | null;
  departureAt: Date;
  /** Fin du créneau réservé : base du plafond de la durée rémunérée. */
  slotEndAt: Date;
  startedAt: Date | null;
  completedAt: Date;
}

export interface CreditedEarning {
  guardId: string;
  missionId: string;
  startedAt: Date;
  endedAt: Date;
  billedMinutes: number;
  hourlyRateCents: number;
  amountCents: number;
}

const RECENT_EARNINGS = 50;
const RECENT_PAYOUTS = 20;
const ALREADY_PENDING = 'Un virement est déjà en cours de traitement';

/** Compte bancaire modifié peu avant une demande de virement : signalé à l'équipe. */
const BANK_CHANGE_WARNING_MS = 48 * 3_600_000;

/**
 * Gains des gardes et virements. Pas de prestataire de paiement en v1 : l'équipe fait
 * les virements à la main puis les marque comme payés dans l'admin.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- Gains

  /**
   * Crédite le garde d'une mission terminée, dans la transaction qui la termine.
   * Idempotent : l'index unique sur la mission empêche tout second gain.
   */
  async creditMission(
    tx: Prisma.TransactionClient,
    mission: CompletedMission,
  ): Promise<(CreditedEarning & { capped: boolean }) | null> {
    if (!mission.guardId) return null;
    const rule = this.earningRule();
    // Plafond : le créneau réservé par la cliente, plus le dépassement admis.
    const { startedAt, endedAt, billedMinutes, amountCents, capped } = missionEarning(
      mission,
      rule,
    );
    const earning: CreditedEarning = {
      guardId: mission.guardId,
      missionId: mission.id,
      startedAt,
      endedAt,
      billedMinutes,
      hourlyRateCents: rule.hourlyRateCents,
      amountCents,
    };
    const { count } = await tx.guardEarning.createMany({ data: earning, skipDuplicates: true });
    return count === 1 ? { ...earning, capped } : null;
  }

  /** Règle de rémunération configurée (taux, minimum, dépassement admis). */
  earningRule(): EarningRule {
    return {
      hourlyRateCents: this.config.get('GUARD_HOURLY_RATE_CENTS'),
      minBilledMinutes: this.config.get('GUARD_MIN_BILLED_MINUTES'),
      maxOvertimeMinutes: this.config.get('GUARD_MAX_OVERTIME_MINUTES'),
    };
  }

  /** Trace un gain crédité, une fois la transaction validée. */
  async auditEarning(earning: CreditedEarning & { capped: boolean }): Promise<void> {
    await this.audit.log({
      actor: 'SYSTEM',
      action: 'guard.earning_credited',
      entityType: 'Mission',
      entityId: earning.missionId,
      metadata: {
        guardId: earning.guardId,
        amountCents: earning.amountCents,
        billedMinutes: earning.billedMinutes,
        hourlyRateCents: earning.hourlyRateCents,
        // Durée réelle au-delà du créneau réservé : à vérifier par l'équipe.
        capped: earning.capped,
      },
    });
  }

  /** Cagnotte du garde : solde, compte masqué, derniers gains et virements. */
  async wallet(guardId: string): Promise<GuardWalletDto> {
    const [balance, account, pending, earnings, payouts] = await Promise.all([
      this.balance(this.prisma, guardId),
      this.prisma.guardBankAccount.findUnique({ where: { guardId } }),
      this.prisma.guardPayout.findFirst({ where: { guardId, status: 'REQUESTED' } }),
      this.prisma.guardEarning.findMany({
        where: { guardId },
        orderBy: { endedAt: 'desc' },
        take: RECENT_EARNINGS,
      }),
      this.prisma.guardPayout.findMany({
        where: { guardId },
        orderBy: { requestedAt: 'desc' },
        take: RECENT_PAYOUTS,
      }),
    ]);
    return {
      ...balance,
      payoutMinCents: this.config.get('PAYOUT_MIN_CENTS'),
      hourlyRateCents: this.config.get('GUARD_HOURLY_RATE_CENTS'),
      minBilledMinutes: this.config.get('GUARD_MIN_BILLED_MINUTES'),
      bankAccount: account ? toBankAccountDto(account) : null,
      pendingPayout: pending ? toPayoutDto(pending) : null,
      earnings: earnings.map(toEarningDto),
      payouts: payouts.map(toPayoutDto),
    };
  }

  /** Solde disponible : gains moins virements demandés ou payés (un refus rend le montant). */
  private async balance(
    db: Prisma.TransactionClient,
    guardId: string,
  ): Promise<{ availableCents: number; totalEarnedCents: number }> {
    const earned = await db.guardEarning.aggregate({
      where: { guardId },
      _sum: { amountCents: true },
    });
    const committed = await db.guardPayout.aggregate({
      where: { guardId, status: { in: ['REQUESTED', 'PAID'] } },
      _sum: { amountCents: true },
    });
    const totalEarnedCents = earned._sum.amountCents ?? 0;
    return {
      totalEarnedCents,
      availableCents: totalEarnedCents - (committed._sum.amountCents ?? 0),
    };
  }

  // ------------------------------------------------------ Compte bancaire

  async setBankAccount(
    user: AuthUser,
    input: BankAccountInput,
    meta: RequestMeta,
  ): Promise<BankAccountDto> {
    const profile = await this.prisma.guardProfile.findUnique({
      where: { userId: user.id },
      include: { bankAccount: { select: { guardId: true } } },
    });
    if (!profile) throw new NotFoundException('Profil garde introuvable');
    const data = {
      holderName: input.holderName,
      ibanEncrypted: this.crypto.encrypt(input.iban),
      ibanPrefix: input.iban.slice(0, 4),
      ibanLast4: input.iban.slice(-4),
    };
    const account = await this.prisma.guardBankAccount.upsert({
      where: { guardId: user.id },
      create: { guardId: user.id, ...data },
      update: data,
    });
    await this.audit.log({
      actor: user,
      action: 'guard.bank_account_updated',
      entityType: 'GuardBankAccount',
      entityId: user.id,
      // Jamais l'IBAN dans le journal, même en partie.
      metadata: { country: input.iban.slice(0, 2), replaced: !!profile.bankAccount },
      meta,
    });
    return toBankAccountDto(account);
  }

  // ------------------------------------------------------------ Virements

  /**
   * Demande de virement de tout le solde disponible. Les demandes simultanées sont
   * sérialisées par un verrou sur le profil du garde ; l'index unique partiel de la base
   * garantit en dernier recours une seule demande en attente.
   */
  async requestPayout(user: AuthUser, meta: RequestMeta): Promise<PayoutDto> {
    const min = this.config.get('PAYOUT_MIN_CENTS');
    let payout: PayoutWithGuard;
    try {
      payout = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ userId: string }[]>`
          SELECT "userId" FROM "GuardProfile" WHERE "userId" = ${user.id} FOR UPDATE`;
        if (locked.length === 0) throw new NotFoundException('Profil garde introuvable');
        const pending = await tx.guardPayout.count({
          where: { guardId: user.id, status: 'REQUESTED' },
        });
        if (pending > 0) throw new ConflictException(ALREADY_PENDING);
        const account = await tx.guardBankAccount.findUnique({ where: { guardId: user.id } });
        if (!account) {
          throw new BadRequestException(
            'Ajoutez votre compte bancaire avant de demander un virement',
          );
        }
        const { availableCents } = await this.balance(tx, user.id);
        if (availableCents < min) {
          throw new BadRequestException(
            `Solde insuffisant : un virement est possible à partir de ${formatPrice(min)}`,
          );
        }
        // Le compte de destination est figé sur la demande.
        return tx.guardPayout.create({
          data: {
            guardId: user.id,
            amountCents: availableCents,
            holderName: account.holderName,
            ibanEncrypted: account.ibanEncrypted,
            ibanPrefix: account.ibanPrefix,
            ibanLast4: account.ibanLast4,
          },
          include: payoutGuardInclude,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(ALREADY_PENDING);
      }
      throw error;
    }

    await this.audit.log({
      actor: user,
      action: 'guard.payout_requested',
      entityType: 'GuardPayout',
      entityId: payout.id,
      metadata: { amountCents: payout.amountCents },
      meta,
    });
    this.realtime.toAdmins('payout:requested', toAdminPayoutDto(payout));
    return toPayoutDto(payout);
  }

  // ---------------------------------------------------------------- Admin

  async adminList(query: PayoutListQuery): Promise<Paginated<AdminPayoutDto>> {
    const where: Prisma.GuardPayoutWhereInput = {
      status: query.status ? { in: query.status } : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.guardPayout.count({ where }),
      this.prisma.guardPayout.findMany({
        where,
        include: payoutGuardInclude,
        orderBy: { requestedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: rows.map(toAdminPayoutDto),
    };
  }

  /** Détail avec l'IBAN complet, pour faire le virement : consultation tracée. */
  async adminGet(admin: AuthUser, id: string, meta: RequestMeta): Promise<AdminPayoutDetailDto> {
    const payout = await this.findPayout(id);
    const iban = formatIban(this.crypto.decrypt(payout.ibanEncrypted));
    // Gains couverts : ceux crédités depuis le virement précédent (un refus rend son montant).
    const previous = await this.prisma.guardPayout.findFirst({
      where: {
        guardId: payout.guardId,
        status: { not: 'REJECTED' },
        requestedAt: { lt: payout.requestedAt },
      },
      orderBy: { requestedAt: 'desc' },
    });
    const [earnings, account] = await Promise.all([
      this.prisma.guardEarning.findMany({
        where: {
          guardId: payout.guardId,
          createdAt: { gt: previous?.requestedAt, lte: payout.requestedAt },
        },
        orderBy: { endedAt: 'desc' },
        take: 100,
      }),
      this.prisma.guardBankAccount.findUnique({ where: { guardId: payout.guardId } }),
    ]);
    const changedAt = account?.updatedAt ?? null;
    await this.audit.log({
      actor: admin,
      action: 'admin.payout_viewed',
      entityType: 'GuardPayout',
      entityId: id,
      metadata: { guardId: payout.guardId },
      meta,
    });
    return {
      ...toAdminPayoutDto(payout),
      iban,
      earnings: earnings.map(toEarningDto),
      bankAccountChangedAt: changedAt?.toISOString() ?? null,
      bankAccountRecentlyChanged:
        !!changedAt && changedAt.getTime() > payout.requestedAt.getTime() - BANK_CHANGE_WARNING_MS,
    };
  }

  async markPaid(
    admin: AuthUser,
    id: string,
    bankReference: string | undefined,
    meta: RequestMeta,
  ): Promise<AdminPayoutDto> {
    const payout = await this.process(admin, id, {
      status: 'PAID',
      bankReference: bankReference || null,
    });
    await this.audit.log({
      actor: admin,
      action: 'payout.paid',
      entityType: 'GuardPayout',
      entityId: id,
      metadata: {
        guardId: payout.guardId,
        amountCents: payout.amountCents,
        bankReference: payout.bankReference,
      },
      meta,
    });
    this.realtime.toUser(payout.guardId, 'payout:updated', toPayoutDto(payout));
    await this.notifications.toUsers([payout.guardId], {
      title: 'Virement effectué',
      body: `${formatPrice(payout.amountCents)} ont été virés sur votre compte ${maskIban(payout.ibanPrefix, payout.ibanLast4)}.`,
      data: { type: 'payout', payoutId: payout.id },
    });
    return toAdminPayoutDto(payout);
  }

  /** Refus motivé : le montant revient dans le solde du garde. */
  async reject(
    admin: AuthUser,
    id: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<AdminPayoutDto> {
    const payout = await this.process(admin, id, { status: 'REJECTED', rejectionReason: reason });
    await this.audit.log({
      actor: admin,
      action: 'payout.rejected',
      entityType: 'GuardPayout',
      entityId: id,
      metadata: { guardId: payout.guardId, amountCents: payout.amountCents, reason },
      meta,
    });
    this.realtime.toUser(payout.guardId, 'payout:updated', toPayoutDto(payout));
    await this.notifications.toUsers([payout.guardId], {
      title: 'Virement refusé',
      body: `Motif : ${reason}. Le montant est de nouveau disponible dans votre solde.`,
      data: { type: 'payout', payoutId: payout.id },
    });
    return toAdminPayoutDto(payout);
  }

  /** Seule une demande en attente peut être traitée, et une seule fois (mise à jour conditionnelle). */
  private async process(
    admin: AuthUser,
    id: string,
    data: Prisma.GuardPayoutUpdateManyMutationInput,
  ): Promise<PayoutWithGuard> {
    const { count } = await this.prisma.guardPayout.updateMany({
      where: { id, status: 'REQUESTED' },
      data: { ...data, processedAt: new Date(), processedById: admin.id },
    });
    const payout = await this.findPayout(id);
    if (count === 0) throw new ConflictException('Ce virement a déjà été traité');
    return payout;
  }

  private async findPayout(id: string): Promise<PayoutWithGuard> {
    const payout = await this.prisma.guardPayout.findUnique({
      where: { id },
      include: payoutGuardInclude,
    });
    if (!payout) throw new NotFoundException('Virement introuvable');
    return payout;
  }
}
