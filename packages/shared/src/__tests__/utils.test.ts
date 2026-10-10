import { describe, expect, it } from 'vitest';
import { lateMarginSeconds, slotEnd, straightLineRoute } from '../routing';
import { createMissionSchema, registerSchema } from '../schemas';
import {
  formatDistance,
  formatDuration,
  isCoveredByWeeklySlots,
  normalizePhone,
  zonedDayMinutes,
} from '../utils';

describe('normalizePhone', () => {
  it('convertit un numéro français en E.164', () => {
    expect(normalizePhone('06 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('0033 6 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
  });
});

describe('créneaux hebdomadaires', () => {
  // Samedi 10 octobre 2026, 20 h 00 à Paris (UTC+2).
  const start = new Date('2026-10-10T18:00:00Z');
  const end = new Date('2026-10-10T18:45:00Z');

  it('lit le jour et l’heure dans le fuseau de Paris', () => {
    expect(zonedDayMinutes(start, 'Europe/Paris')).toEqual({ isoDay: 6, minutes: 20 * 60 });
  });

  it('vérifie la couverture par un créneau', () => {
    const slots = [{ dayOfWeek: 6, startMinute: 18 * 60, endMinute: 23 * 60 }];
    expect(isCoveredByWeeklySlots(start, end, slots, 'Europe/Paris')).toBe(true);
    expect(
      isCoveredByWeeklySlots(
        start,
        end,
        [{ ...slots[0]!, endMinute: 20 * 60 + 30 }],
        'Europe/Paris',
      ),
    ).toBe(false);
  });

  it('gère le passage de minuit', () => {
    const s = new Date('2026-10-10T21:30:00Z'); // 23 h 30
    const e = new Date('2026-10-10T22:30:00Z'); // 0 h 30 dimanche
    const slots = [
      { dayOfWeek: 6, startMinute: 20 * 60, endMinute: 1440 },
      { dayOfWeek: 7, startMinute: 0, endMinute: 2 * 60 },
    ];
    expect(isCoveredByWeeklySlots(s, e, slots, 'Europe/Paris')).toBe(true);
    expect(isCoveredByWeeklySlots(s, e, [slots[0]!], 'Europe/Paris')).toBe(false);
  });
});

describe('trajet', () => {
  it('estime un trajet en ligne droite', () => {
    const r = straightLineRoute(
      [
        { lat: 48.8566, lng: 2.3412 },
        { lat: 48.8566, lng: 2.3548 },
      ],
      'WALK',
    );
    expect(r.approximate).toBe(true);
    expect(r.distanceMeters).toBeGreaterThan(1250);
    expect(r.durationSeconds).toBeGreaterThan(900);
  });

  it('calcule la fin de créneau avec la marge de retard', () => {
    expect(lateMarginSeconds(600)).toBe(600);
    expect(lateMarginSeconds(4 * 3600)).toBe(3600);
    const d = new Date('2026-10-10T18:00:00Z');
    expect(slotEnd(d, 1200).toISOString()).toBe('2026-10-10T18:30:00.000Z');
  });
});

describe('formatage', () => {
  it('formate distances et durées', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(2350)).toBe('2,4 km');
    expect(formatDuration(25 * 60)).toBe('25 min');
    expect(formatDuration(95 * 60)).toBe('1 h 35');
  });
});

describe('schémas', () => {
  it('refuse l’inscription publique d’un admin', () => {
    const r = registerSchema.safeParse({
      email: 'a@b.fr',
      password: 'motdepasse123',
      firstName: 'A',
      lastName: 'B',
      phone: '+33612345678',
      role: 'ADMIN',
    });
    expect(r.success).toBe(false);
  });

  it('exige un départ et une arrivée', () => {
    const r = createMissionSchema.safeParse({
      type: 'ONE_OFF',
      route: { mode: 'WALK', points: [{ lat: 48.85, lng: 2.34 }] },
    });
    expect(r.success).toBe(false);
  });
});
