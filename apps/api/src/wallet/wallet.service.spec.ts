import { Prisma } from '@prisma/client';
import { AppConfig } from '../config/app-config.service';
import { WalletService } from './wallet.service';

describe('WalletService.creditMission', () => {
  const settings: Record<string, number> = {
    GUARD_HOURLY_RATE_CENTS: 2400,
    GUARD_MIN_BILLED_MINUTES: 45,
  };
  const config = { get: (key: string) => settings[key] } as unknown as AppConfig;
  const wallet = new WalletService(
    null as never,
    null as never,
    config,
    null as never,
    null as never,
    null as never,
  );
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 10, 20, 0) + minutes * 60_000);

  /** Transaction factice : `count` = 0 simule un gain déjà enregistré pour la mission. */
  function fakeTx(count = 1) {
    const createMany = jest.fn().mockResolvedValue({ count });
    return {
      tx: { guardEarning: { createMany } } as unknown as Prisma.TransactionClient,
      createMany,
    };
  }

  it('applique le taux et le minimum configurés, depuis le début du suivi', async () => {
    const { tx, createMany } = fakeTx();
    const earning = await wallet.creditMission(tx, {
      id: 'm1',
      guardId: 'g1',
      departureAt: at(-30),
      startedAt: at(0),
      completedAt: at(61.2),
    });
    // 61 min 12 s → 62 minutes commencées → 2400 × 62 / 60 = 2480 centimes.
    expect(earning).toEqual({
      guardId: 'g1',
      missionId: 'm1',
      startedAt: at(0),
      endedAt: at(61.2),
      billedMinutes: 62,
      hourlyRateCents: 2400,
      amountCents: 2480,
    });
    expect(createMany).toHaveBeenCalledWith({ data: earning, skipDuplicates: true });
  });

  it('part de l’heure de départ prévue quand le suivi n’a pas de début', async () => {
    const { tx } = fakeTx();
    const earning = await wallet.creditMission(tx, {
      id: 'm2',
      guardId: 'g1',
      departureAt: at(0),
      startedAt: null,
      completedAt: at(10),
    });
    expect(earning).toMatchObject({ startedAt: at(0), billedMinutes: 45, amountCents: 1800 });
  });

  it('ne crédite rien sans garde ni pour une mission déjà créditée', async () => {
    const none = fakeTx();
    const mission = { id: 'm3', departureAt: at(0), startedAt: at(0), completedAt: at(90) };
    expect(await wallet.creditMission(none.tx, { ...mission, guardId: null })).toBeNull();
    expect(none.createMany).not.toHaveBeenCalled();

    const duplicate = fakeTx(0);
    expect(await wallet.creditMission(duplicate.tx, { ...mission, guardId: 'g1' })).toBeNull();
  });
});
