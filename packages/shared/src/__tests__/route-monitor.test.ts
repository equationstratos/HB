import { describe, expect, it } from 'vitest';
import { DeviationType } from '../enums';
import type { Position } from '../geo';
import {
  INITIAL_MONITOR_STATE,
  evaluatePing,
  isSignalLost,
  monitorConfigFor,
  type MonitorState,
} from '../route-monitor';

const coordinates: Position[] = [
  [2.3412, 48.8566],
  [2.3548, 48.8566],
];
const route = {
  coordinates,
  waypoints: [
    { lat: 48.8566, lng: 2.3412 },
    { lat: 48.8566, lng: 2.3548 },
  ],
};
const config = monitorConfigFor('WALK');
const t0 = Date.parse('2026-10-10T20:00:00Z');
const at = (seconds: number) => new Date(t0 + seconds * 1000).toISOString();

/** Environ 330 m au nord du trajet. */
const OFF = { lat: 48.8596, lng: 2.348 };
const ON = { lat: 48.8567, lng: 2.348 };

function run(pings: { lat: number; lng: number; s: number; accuracy?: number }[]) {
  let state: MonitorState = INITIAL_MONITOR_STATE;
  const events = [];
  for (const p of pings) {
    const r = evaluatePing(state, { ...p, recordedAt: at(p.s) }, route, config);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

describe('evaluatePing — écart de trajet', () => {
  it("n'alerte pas tant que la cliente reste sur le trajet", () => {
    const { events } = run([
      { ...ON, s: 0 },
      { ...ON, s: 30 },
      { lat: 48.8567, lng: 2.35, s: 60 },
    ]);
    expect(events).toEqual([]);
  });

  it('attend 60 secondes hors trajet avant d’alerter', () => {
    const { events } = run([
      { ...OFF, s: 0 },
      { ...OFF, s: 30 },
    ]);
    expect(events).toEqual([]);
  });

  it('alerte une seule fois après 60 secondes hors trajet', () => {
    const { events, state } = run([
      { ...OFF, s: 0 },
      { ...OFF, s: 61 },
      { ...OFF, s: 90 },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: DeviationType.OFF_ROUTE, since: at(0) });
    expect(state.offRouteAlerted).toBe(true);
  });

  it('signale le retour sur le trajet puis peut alerter à nouveau', () => {
    const { events } = run([
      { ...OFF, s: 0 },
      { ...OFF, s: 70 },
      { ...ON, s: 100 },
      { ...OFF, s: 200 },
      { ...OFF, s: 270 },
    ]);
    expect(events.map((e) => e.type)).toEqual(['OFF_ROUTE', 'BACK_ON_ROUTE', 'OFF_ROUTE']);
  });

  it('ignore les positions trop imprécises', () => {
    const { events } = run([
      { ...OFF, s: 0, accuracy: 500 },
      { ...OFF, s: 120, accuracy: 500 },
    ]);
    expect(events.filter((e) => e.type === 'OFF_ROUTE')).toEqual([]);
  });

  it('déduit l’imprécision annoncée de la distance', () => {
    // 330 m d'écart, 190 m d'imprécision : 140 m effectifs, sous la tolérance de 150 m.
    const { events } = run([
      { ...OFF, s: 0, accuracy: 190 },
      { ...OFF, s: 120, accuracy: 190 },
    ]);
    expect(events).toEqual([]);
  });

  it('ignore une position plus ancienne que la précédente', () => {
    let state = evaluatePing(
      INITIAL_MONITOR_STATE,
      { ...OFF, recordedAt: at(100) },
      route,
      config,
    ).state;
    const r = evaluatePing(state, { ...ON, recordedAt: at(50) }, route, config);
    expect(r.state).toBe(state);
    state = r.state;
    expect(state.offRouteSince).toBe(at(100));
  });
});

describe('evaluatePing — arrêt prolongé', () => {
  const MIDDLE = { lat: 48.8566, lng: 2.348 };

  it('alerte après le seuil d’immobilité hors étape', () => {
    const { events } = run([
      { ...MIDDLE, s: 0 },
      { ...MIDDLE, s: 300 },
      { ...MIDDLE, s: 8 * 60 + 1 },
    ]);
    expect(events).toEqual([{ type: DeviationType.STOPPED, since: at(0) }]);
  });

  it('n’alerte pas à proximité d’une étape ou de l’arrivée', () => {
    const END = { lat: 48.8566, lng: 2.3547 };
    const { events } = run([
      { ...END, s: 0 },
      { ...END, s: 20 * 60 },
    ]);
    expect(events).toEqual([]);
  });

  it('réarme la détection dès que la cliente repart', () => {
    const { events } = run([
      { ...MIDDLE, s: 0 },
      { ...MIDDLE, s: 9 * 60 },
      { lat: 48.8566, lng: 2.351, s: 10 * 60 },
      { lat: 48.8566, lng: 2.351, s: 19 * 60 },
    ]);
    expect(events.map((e) => e.type)).toEqual(['STOPPED', 'STOPPED']);
  });
});

describe('isSignalLost', () => {
  it('détecte trois minutes sans position', () => {
    const now = new Date(t0 + 4 * 60_000);
    expect(isSignalLost(at(0), at(0), now)).toBe(true);
    expect(isSignalLost(at(120), at(0), now)).toBe(false);
    expect(isSignalLost(null, at(0), now)).toBe(true);
  });
});
