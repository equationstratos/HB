// Mise à jour d'une installation existante : données ajoutées par les nouvelles versions.
// Lancé par « pnpm run update:server » après les migrations. Idempotent.
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_GUARD_HOURLY_RATE_CENTS,
  DEFAULT_GUARD_MAX_OVERTIME_MINUTES,
  DEFAULT_GUARD_MIN_BILLED_MINUTES,
  missionEarning,
} from '@hb/shared';

const prisma = new PrismaClient();

const envInt = (key: string, fallback: number) => {
  const value = Number(process.env[key]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
};

/** Gains des missions terminées avant l'arrivée de la cagnotte des gardes. */
async function creditMissingEarnings(): Promise<number> {
  const rule = {
    hourlyRateCents: envInt('GUARD_HOURLY_RATE_CENTS', DEFAULT_GUARD_HOURLY_RATE_CENTS),
    minBilledMinutes: envInt('GUARD_MIN_BILLED_MINUTES', DEFAULT_GUARD_MIN_BILLED_MINUTES),
    maxOvertimeMinutes: envInt('GUARD_MAX_OVERTIME_MINUTES', DEFAULT_GUARD_MAX_OVERTIME_MINUTES),
  };
  const missions = await prisma.mission.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { not: null },
      guardId: { not: null },
      earning: { is: null },
      guard: { guardProfile: { isNot: null } },
    },
  });
  const { count } = await prisma.guardEarning.createMany({
    data: missions.map((m) => {
      const { startedAt, endedAt, billedMinutes, amountCents } = missionEarning(
        { ...m, completedAt: m.completedAt! },
        rule,
      );
      return {
        guardId: m.guardId!,
        missionId: m.id,
        startedAt,
        endedAt,
        hourlyRateCents: rule.hourlyRateCents,
        billedMinutes,
        amountCents,
      };
    }),
    skipDuplicates: true,
  });
  return count;
}

async function main() {
  const credited = await creditMissingEarnings();
  console.log(
    credited > 0
      ? `Gains crédités pour ${credited} mission(s) déjà terminée(s).`
      : 'Aucun gain manquant.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
