import { describe, expect, it } from 'vitest';
import {
  boundingBox,
  haversineMeters,
  pointAlong,
  polylineLengthMeters,
  projectOnPolyline,
  type Position,
} from '../geo';

// Rue de Rivoli, Paris : environ 1 km plein est.
const A = { lat: 48.8566, lng: 2.3412 };
const B = { lat: 48.8566, lng: 2.3548 };
const line: Position[] = [
  [A.lng, A.lat],
  [B.lng, B.lat],
];

describe('haversineMeters', () => {
  it('mesure environ 1 km entre deux points de Paris', () => {
    expect(haversineMeters(A, B)).toBeGreaterThan(990);
    expect(haversineMeters(A, B)).toBeLessThan(1010);
  });

  it('vaut zéro pour un même point', () => {
    expect(haversineMeters(A, A)).toBe(0);
  });
});

describe('projectOnPolyline', () => {
  it('donne la distance perpendiculaire à un segment', () => {
    // 0,001° de latitude ≈ 111 m au nord du milieu du segment.
    const p = { lat: 48.8576, lng: 2.348 };
    const r = projectOnPolyline(p, line);
    expect(r.distanceMeters).toBeGreaterThan(105);
    expect(r.distanceMeters).toBeLessThan(118);
    expect(r.segmentIndex).toBe(0);
    expect(r.alongMeters).toBeGreaterThan(480);
    expect(r.alongMeters).toBeLessThan(520);
  });

  it("mesure jusqu'à l'extrémité quand le point dépasse le segment", () => {
    const p = { lat: 48.8566, lng: 2.36 };
    const r = projectOnPolyline(p, line);
    expect(r.distanceMeters).toBeCloseTo(haversineMeters(p, B), -1);
  });

  it('choisit le segment le plus proche sur un tracé à plusieurs segments', () => {
    const coords: Position[] = [
      [2.3412, 48.8566],
      [2.3548, 48.8566],
      [2.3548, 48.8656],
    ];
    const r = projectOnPolyline({ lat: 48.861, lng: 2.3552 }, coords);
    expect(r.segmentIndex).toBe(1);
    expect(r.distanceMeters).toBeLessThan(40);
  });
});

describe('outils', () => {
  it('calcule la longueur et un point le long du tracé', () => {
    const len = polylineLengthMeters(line);
    const mid = pointAlong(line, len / 2);
    expect(mid.lng).toBeCloseTo((A.lng + B.lng) / 2, 4);
    expect(pointAlong(line, len * 2)).toEqual(B);
  });

  it('englobe le cercle dans le carré', () => {
    const box = boundingBox(A, 5000);
    const north = { lat: box.maxLat, lng: A.lng };
    const east = { lat: A.lat, lng: box.maxLng };
    expect(haversineMeters(A, north)).toBeCloseTo(5000, -1);
    expect(haversineMeters(A, east)).toBeGreaterThanOrEqual(4990);
  });
});
