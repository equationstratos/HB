import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Plan, Prisma, Subscription } from '@prisma/client';
import { Paginated, PlanDto, PlanInput, PlanUpdateInput, SubscriptionDto } from '@hb/shared';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export function toPlanDto(p: Plan): PlanDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    missionsPerMonth: p.missionsPerMonth,
    priceCents: p.priceCents,
    active: p.active,
  };
}

function toSubscriptionDto(s: Subscription & { plan: Plan }): SubscriptionDto {
  return {
    id: s.id,
    plan: toPlanDto(s.plan),
    status: s.status,
    currentPeriodStart: s.currentPeriodStart.toISOString(),
    currentPeriodEnd: s.currentPeriodEnd.toISOString(),
    missionsUsed: s.missionsUsed,
    missionsRemaining: Math.max(0, s.plan.missionsPerMonth - s.missionsUsed),
    paymentActive: false,
  };
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Abonnements mensuels avec quota de protections. Aucun encaissement en v1 : la
 * souscription est enregistrée telle quelle, Stripe sera branché ici plus tard.
 */
@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans(includeInactive = false): Promise<PlanDto[]> {
    const plans = await this.prisma.plan.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { priceCents: 'asc' },
    });
    return plans.map(toPlanDto);
  }

  async createPlan(input: PlanInput): Promise<PlanDto> {
    return toPlanDto(
      await this.prisma.plan.create({ data: { ...input, description: input.description ?? null } }),
    );
  }

  async updatePlan(id: string, input: PlanUpdateInput): Promise<PlanDto> {
    return toPlanDto(await this.prisma.plan.update({ where: { id }, data: input }));
  }

  async mine(clientId: string): Promise<SubscriptionDto | null> {
    const sub = await this.active(this.prisma, clientId);
    return sub ? toSubscriptionDto(sub) : null;
  }

  async subscribe(clientId: string, planId: string): Promise<SubscriptionDto> {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.active) throw new NotFoundException('Formule introuvable');
    const current = await this.active(this.prisma, clientId);
    if (current) {
      if (current.planId === planId) throw new ConflictException('Vous avez déjà cette formule');
      // Changement de formule : la période et la consommation en cours sont conservées.
      const updated = await this.prisma.subscription.update({
        where: { id: current.id },
        data: { planId },
        include: { plan: true },
      });
      return toSubscriptionDto(updated);
    }
    const now = new Date();
    const created = await this.prisma.subscription.create({
      data: { clientId, planId, currentPeriodStart: now, currentPeriodEnd: addMonths(now, 1) },
      include: { plan: true },
    });
    return toSubscriptionDto(created);
  }

  async cancel(clientId: string): Promise<void> {
    const current = await this.active(this.prisma, clientId);
    if (!current) throw new NotFoundException('Aucun abonnement actif');
    await this.prisma.subscription.update({
      where: { id: current.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  /** Décompte une protection du quota. À appeler dans la transaction de création de mission. */
  async consume(tx: Tx, clientId: string): Promise<string> {
    const sub = await this.active(tx, clientId);
    if (!sub)
      throw new BadRequestException(
        'Aucun abonnement actif : choisissez une protection ponctuelle',
      );
    const { count } = await tx.subscription.updateMany({
      where: { id: sub.id, missionsUsed: { lt: sub.plan.missionsPerMonth } },
      data: { missionsUsed: { increment: 1 } },
    });
    if (count === 0) {
      throw new BadRequestException('Quota mensuel atteint : choisissez une protection ponctuelle');
    }
    return sub.id;
  }

  /** Rend une protection au quota (annulation avant le début). */
  async refund(subscriptionId: string | null): Promise<void> {
    if (!subscriptionId) return;
    await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, missionsUsed: { gt: 0 } },
      data: { missionsUsed: { decrement: 1 } },
    });
  }

  async adminList(
    page: number,
    pageSize: number,
  ): Promise<Paginated<SubscriptionDto & { clientId: string; clientName: string }>> {
    const [total, rows] = await Promise.all([
      this.prisma.subscription.count(),
      this.prisma.subscription.findMany({
        include: { plan: true, client: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((s) => ({
        ...toSubscriptionDto(s),
        clientId: s.clientId,
        clientName: `${s.client.firstName} ${s.client.lastName}`,
      })),
    };
  }

  /** Abonnement actif, avec bascule automatique sur la période en cours. */
  private async active(db: Tx | PrismaService, clientId: string) {
    const sub = await db.subscription.findFirst({
      where: { clientId, status: 'ACTIVE' },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return null;
    const now = new Date();
    if (sub.currentPeriodEnd > now) return sub;
    let start = sub.currentPeriodStart;
    let end = sub.currentPeriodEnd;
    while (end <= now) {
      start = end;
      end = addMonths(end, 1);
    }
    return db.subscription.update({
      where: { id: sub.id },
      data: { currentPeriodStart: start, currentPeriodEnd: end, missionsUsed: 0 },
      include: { plan: true },
    });
  }
}
