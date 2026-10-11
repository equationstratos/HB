import { describe, expect, it } from 'vitest';
import { tripWindow } from '../trip-window';

describe('tripWindow', () => {
  const route = { expectedArrivalAt: '2026-10-10T18:25:00.000Z' };

  it('mission à venir : départ prévu et fin estimée d’après le trajet', () => {
    expect(tripWindow({ departureAt: '2026-10-10T18:00:00.000Z', route })).toEqual({
      start: '2026-10-10T18:00:00.000Z',
      end: '2026-10-10T18:25:00.000Z',
      durationSeconds: 25 * 60,
      estimated: true,
    });
  });

  it('suivi en cours : début réel, fin toujours estimée', () => {
    const w = tripWindow({
      departureAt: '2026-10-10T18:00:00.000Z',
      startedAt: '2026-10-10T18:05:00.000Z',
      completedAt: null,
      route: { expectedArrivalAt: '2026-10-10T18:30:00.000Z' },
    });
    expect(w.start).toBe('2026-10-10T18:05:00.000Z');
    expect(w.end).toBe('2026-10-10T18:30:00.000Z');
    expect(w.durationSeconds).toBe(25 * 60);
    expect(w.estimated).toBe(true);
  });

  it('mission terminée : horaires et durée réels', () => {
    expect(
      tripWindow({
        departureAt: '2026-10-10T18:00:00.000Z',
        startedAt: '2026-10-10T18:05:00.000Z',
        completedAt: '2026-10-10T18:41:00.000Z',
        route,
      }),
    ).toEqual({
      start: '2026-10-10T18:05:00.000Z',
      end: '2026-10-10T18:41:00.000Z',
      durationSeconds: 36 * 60,
      estimated: false,
    });
  });

  it('ne renvoie jamais de durée négative', () => {
    const w = tripWindow({
      departureAt: '2026-10-10T18:00:00.000Z',
      startedAt: '2026-10-10T18:30:00.000Z',
      route,
    });
    expect(w.durationSeconds).toBe(0);
  });
});
