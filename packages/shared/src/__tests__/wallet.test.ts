import { describe, expect, it } from 'vitest';
import { bankAccountSchema } from '../schemas';
import { formatIban, guardEarning, isValidIban, maskIban, normalizeIban } from '../wallet';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 10, 20, 0) + minutes * 60_000);

describe('gain du garde', () => {
  const rule = { hourlyRateCents: 2000, minBilledMinutes: 30 };

  it('facture au minimum 30 minutes', () => {
    expect(guardEarning({ ...rule, startedAt: at(0), endedAt: at(12) })).toEqual({
      billedMinutes: 30,
      amountCents: 1000,
      capped: false,
    });
  });

  it('compte chaque minute commencée et arrondit au centime', () => {
    // 46 min 30 s → 47 min → 2000 × 47 / 60 = 1566,67 centimes.
    expect(guardEarning({ ...rule, startedAt: at(0), endedAt: at(46.5) })).toEqual({
      billedMinutes: 47,
      amountCents: 1567,
      capped: false,
    });
    expect(guardEarning({ ...rule, startedAt: at(0), endedAt: at(60) }).amountCents).toBe(2000);
  });

  it('suit le taux et le minimum configurés', () => {
    expect(
      guardEarning({
        hourlyRateCents: 2500,
        minBilledMinutes: 45,
        startedAt: at(0),
        endedAt: at(5),
      }),
    ).toEqual({ billedMinutes: 45, amountCents: 1875, capped: false });
  });

  it('plafonne la durée rémunérée, sans descendre sous le minimum', () => {
    const capped = guardEarning({
      ...rule,
      startedAt: at(0),
      endedAt: at(600),
      maxBilledMinutes: 90,
    });
    expect(capped).toEqual({ billedMinutes: 90, amountCents: 3000, capped: true });
    // Sous le plafond : durée réelle.
    expect(
      guardEarning({ ...rule, startedAt: at(0), endedAt: at(80), maxBilledMinutes: 90 }),
    ).toEqual({ billedMinutes: 80, amountCents: 2667, capped: false });
    // Plafond inférieur au minimum : le minimum reste dû.
    expect(
      guardEarning({ ...rule, startedAt: at(0), endedAt: at(600), maxBilledMinutes: 10 }),
    ).toMatchObject({ billedMinutes: 30, capped: true });
  });
});

describe('IBAN', () => {
  it('accepte des IBAN valides, saisis avec espaces et minuscules', () => {
    for (const iban of [
      'FR76 3000 6000 0112 3456 7890 189',
      'fr1420041010050500013m02606',
      'DE89 3704 0044 0532 0130 00',
      'GB82 WEST 1234 5698 7654 32',
      'BE68 5390 0754 7034',
      'NL91ABNA0417164300',
    ]) {
      expect(isValidIban(iban)).toBe(true);
    }
  });

  it('refuse une clé de contrôle fausse, une longueur fausse ou des caractères interdits', () => {
    expect(isValidIban('FR76 3000 6000 0112 3456 7890 188')).toBe(false);
    expect(isValidIban('FR77 3000 6000 0112 3456 7890 189')).toBe(false);
    expect(isValidIban('FR76 3000 6000 0112 3456 7890 18')).toBe(false);
    expect(isValidIban('FR76-3000-6000-0112-3456-7890-189')).toBe(false);
    expect(isValidIban('1234')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });

  it('normalise, formate et masque', () => {
    expect(normalizeIban(' fr76 3000\t6000 ')).toBe('FR7630006000');
    expect(formatIban('FR7630006000011234567890189')).toBe('FR76 3000 6000 0112 3456 7890 189');
    expect(maskIban('FR76', '0189')).toBe('FR76 •••• •••• 0189');
  });

  it('valide le formulaire de compte bancaire', () => {
    const ok = bankAccountSchema.safeParse({
      holderName: '  Karim Benali ',
      iban: 'fr76 3000 6000 0112 3456 7890 189',
    });
    expect(ok.success && ok.data).toEqual({
      holderName: 'Karim Benali',
      iban: 'FR7630006000011234567890189',
    });
    const ko = bankAccountSchema.safeParse({ holderName: 'K', iban: 'FR76 0000' });
    expect(ko.success).toBe(false);
    expect(ko.error?.issues.map((i) => i.path[0])).toEqual(['holderName', 'iban']);
  });
});
