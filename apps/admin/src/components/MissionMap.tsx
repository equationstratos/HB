import {
  DEFAULT_MAP_ATTRIBUTION,
  MAP_MAX_ZOOM,
  MAP_TILE_PATH,
  type LatLng,
  type LocationDto,
  type MissionRouteDto,
} from '@hb/shared';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Fragment, useEffect, useMemo } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { api, client } from '../lib/client';

/** Tuiles servies par l'API (même origine), sauf adresse imposée à la compilation. */
const TILE_URL = import.meta.env.VITE_TILE_URL || `${client.origin}${MAP_TILE_PATH}`;
const PARIS: [number, number] = [48.8566, 2.3522];

/** Leaflet affiche l'attribution en HTML : celle du serveur est du texte simple. */
const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Leaflet écrit les couleurs en attributs SVG, qui n'acceptent pas var(--…) : on les résout. */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const pin = (kind: 'client' | 'guard' | 'alert') =>
  L.divIcon({
    className: '',
    html: `<div class="map-pin ${kind}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
const ICONS = { client: pin('client'), guard: pin('guard'), alert: pin('alert') };

export interface MapMission {
  id: string;
  label: string;
  route: MissionRouteDto;
  client?: LocationDto | null;
  guard?: LocationDto | null;
  alert?: boolean;
  selected?: boolean;
}

function FitBounds({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    // On ne recadre que lorsque la sélection change, pas à chaque position reçue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

/**
 * Carte des protections : trajet prévu (violet), cliente (rose), garde (bleu),
 * cliente en alerte (rouge pulsé).
 */
export function MissionMap({
  missions,
  track,
  onSelect,
  className = 'map',
}: {
  missions: MapMission[];
  track?: LatLng[];
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const focus = missions.filter((m) => m.selected);
  const fitTarget = focus.length > 0 ? focus : missions;
  const points = useMemo(
    () =>
      fitTarget.flatMap((m) =>
        m.route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      ),
    [fitTarget],
  );
  const fitKey = fitTarget.map((m) => `${m.id}:${m.route.version}`).join('|');
  const routeColor = cssVar('--route', '#6e5bf0');
  const clientColor = cssVar('--client', '#e0457b');
  const mapConfig = useQuery({
    queryKey: ['map-config'],
    queryFn: api.map.config,
    staleTime: Infinity,
    enabled: !import.meta.env.VITE_TILE_URL,
  });
  const attribution = escapeHtml(mapConfig.data?.attribution ?? DEFAULT_MAP_ATTRIBUTION);

  return (
    <MapContainer center={PARIS} zoom={13} className={className} scrollWheelZoom>
      {/* react-leaflet ne met pas à jour l'attribution : la clé recrée la couche. */}
      <TileLayer
        key={attribution}
        url={TILE_URL}
        attribution={attribution}
        maxZoom={MAP_MAX_ZOOM}
      />
      <FitBounds points={points} fitKey={fitKey} />
      {missions.map((m) => {
        const line = m.route.geometry.coordinates.map(
          ([lng, lat]) => [lat, lng] as [number, number],
        );
        const start = m.route.waypoints[0];
        const end = m.route.waypoints[m.route.waypoints.length - 1];
        return (
          <Fragment key={m.id}>
            <Polyline
              positions={line}
              pathOptions={{
                color: routeColor,
                weight: m.selected ? 6 : 4,
                opacity: m.selected || focus.length === 0 ? 0.9 : 0.35,
              }}
              eventHandlers={{ click: () => onSelect?.(m.id) }}
            />
            {start && (
              <CircleMarker
                center={[start.lat, start.lng]}
                radius={5}
                pathOptions={{ color: routeColor, fillOpacity: 1 }}
              />
            )}
            {end && (
              <CircleMarker
                center={[end.lat, end.lng]}
                radius={7}
                pathOptions={{ color: routeColor, fillColor: '#fff', fillOpacity: 1, weight: 3 }}
              >
                <Tooltip>Arrivée {end.address ? `— ${end.address}` : ''}</Tooltip>
              </CircleMarker>
            )}
            {m.guard && (
              <Marker
                position={[m.guard.lat, m.guard.lng]}
                icon={ICONS.guard}
                eventHandlers={{ click: () => onSelect?.(m.id) }}
              >
                <Tooltip>Garde — {m.label}</Tooltip>
              </Marker>
            )}
            {m.client && (
              <Marker
                position={[m.client.lat, m.client.lng]}
                icon={m.alert ? ICONS.alert : ICONS.client}
                zIndexOffset={1000}
                eventHandlers={{ click: () => onSelect?.(m.id) }}
              >
                <Tooltip permanent={m.alert} direction="top" offset={[0, -10]}>
                  {m.alert ? '⚠ ' : ''}
                  {m.label}
                </Tooltip>
              </Marker>
            )}
          </Fragment>
        );
      })}
      {track && track.length > 1 && (
        <Polyline
          positions={track.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: clientColor, weight: 3, dashArray: '4 6' }}
        />
      )}
    </MapContainer>
  );
}
