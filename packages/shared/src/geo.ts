export interface LatLng {
  lat: number;
  lng: number;
}

/** Coordonnée GeoJSON : [longitude, latitude]. */
export type Position = [number, number];

export interface LineString {
  type: 'LineString';
  coordinates: Position[];
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distance orthodromique en mètres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function toLatLng(p: Position): LatLng {
  return { lat: p[1], lng: p[0] };
}

export function toPosition(p: LatLng): Position {
  return [p.lng, p.lat];
}

export function polylineLengthMeters(coords: readonly Position[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(toLatLng(coords[i - 1]!), toLatLng(coords[i]!));
  }
  return total;
}

/**
 * Projection équirectangulaire locale centrée sur `origin`. Précise à moins de 0,5 % sur
 * quelques kilomètres, ce qui suffit largement pour mesurer un écart de trajet.
 */
function project(origin: LatLng, p: LatLng): { x: number; y: number } {
  const cosLat = Math.cos(toRad(origin.lat));
  return {
    x: toRad(p.lng - origin.lng) * cosLat * EARTH_RADIUS_M,
    y: toRad(p.lat - origin.lat) * EARTH_RADIUS_M,
  };
}

export interface PolylineProjection {
  /** Distance en mètres entre le point et le tracé. */
  distanceMeters: number;
  /** Index du segment le plus proche (entre coords[i] et coords[i + 1]). */
  segmentIndex: number;
  /** Distance parcourue le long du tracé jusqu'au point projeté. */
  alongMeters: number;
}

export function projectOnPolyline(point: LatLng, coords: readonly Position[]): PolylineProjection {
  if (coords.length === 0) {
    return { distanceMeters: Infinity, segmentIndex: -1, alongMeters: 0 };
  }
  if (coords.length === 1) {
    return {
      distanceMeters: haversineMeters(point, toLatLng(coords[0]!)),
      segmentIndex: 0,
      alongMeters: 0,
    };
  }

  let best: PolylineProjection = { distanceMeters: Infinity, segmentIndex: 0, alongMeters: 0 };
  let cumulative = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = toLatLng(coords[i]!);
    const b = toLatLng(coords[i + 1]!);
    const pa = project(point, a);
    const pb = project(point, b);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const lenSq = dx * dx + dy * dy;
    // Le point est l'origine (0, 0) de la projection.
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(pa.x * dx + pa.y * dy) / lenSq));
    const cx = pa.x + t * dx;
    const cy = pa.y + t * dy;
    const dist = Math.sqrt(cx * cx + cy * cy);
    const segLen = haversineMeters(a, b);
    if (dist < best.distanceMeters) {
      best = { distanceMeters: dist, segmentIndex: i, alongMeters: cumulative + t * segLen };
    }
    cumulative += segLen;
  }
  return best;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Carré englobant un cercle de `radiusMeters` autour de `center` (pré-filtre SQL). */
export function boundingBox(center: LatLng, radiusMeters: number): BoundingBox {
  const dLat = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const cos = Math.max(0.01, Math.cos(toRad(center.lat)));
  const dLng = dLat / cos;
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

/** Point situé à `meters` le long du tracé (utile pour les simulations). */
export function pointAlong(coords: readonly Position[], meters: number): LatLng {
  if (coords.length === 0) throw new Error('Tracé vide');
  let remaining = Math.max(0, meters);
  for (let i = 0; i < coords.length - 1; i++) {
    const a = toLatLng(coords[i]!);
    const b = toLatLng(coords[i + 1]!);
    const seg = haversineMeters(a, b);
    if (remaining <= seg) {
      const t = seg === 0 ? 0 : remaining / seg;
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    remaining -= seg;
  }
  return toLatLng(coords[coords.length - 1]!);
}
