import type { LatLng, Position } from '@hb/shared';
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline, type MapPressEvent } from 'react-native-maps';
import { useTheme } from '../theme';

const PARIS = { latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.06, longitudeDelta: 0.06 };
const toMap = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

export interface RouteMapProps {
  /** Tracé GeoJSON du trajet. */
  line?: Position[];
  /** Départ, étapes, arrivée. */
  waypoints?: LatLng[];
  client?: LatLng | null;
  guard?: LatLng | null;
  /** Point mis en évidence (écart, SOS). */
  alert?: LatLng | null;
  onPress?: (point: LatLng) => void;
  height?: number;
  showsUserLocation?: boolean;
}

/** Carte du trajet surveillé : tracé, étapes, cliente et garde. */
export function RouteMap({
  line,
  waypoints = [],
  client,
  guard,
  alert,
  onPress,
  height = 280,
  showsUserLocation,
}: RouteMapProps) {
  const { colors, radius } = useTheme();
  const ref = useRef<MapView>(null);
  const coords = useMemo(
    () => (line ?? []).map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    [line],
  );
  const fitKey = JSON.stringify([
    coords.length ? [coords[0], coords[coords.length - 1]] : null,
    waypoints,
  ]);

  useEffect(() => {
    const pts = [...coords, ...waypoints.map(toMap)];
    if (pts.length === 0) return;
    const t = setTimeout(
      () =>
        ref.current?.fitToCoordinates(pts, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        }),
      250,
    );
    return () => clearTimeout(t);
    // Recadrage uniquement quand le trajet change, pas à chaque position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <View
      style={{
        height,
        borderRadius: radius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        initialRegion={PARIS}
        showsUserLocation={showsUserLocation}
        onPress={
          onPress
            ? (e: MapPressEvent) =>
                onPress({
                  lat: e.nativeEvent.coordinate.latitude,
                  lng: e.nativeEvent.coordinate.longitude,
                })
            : undefined
        }
      >
        {coords.length > 1 && (
          <Polyline coordinates={coords} strokeColor={colors.route} strokeWidth={5} />
        )}
        {waypoints.map((w, i) => (
          <Marker
            key={`wp-${i}-${w.lat}-${w.lng}`}
            coordinate={toMap(w)}
            pinColor={
              i === 0
                ? colors.success
                : i === waypoints.length - 1
                  ? colors.primary
                  : colors.warning
            }
            title={i === 0 ? 'Départ' : i === waypoints.length - 1 ? 'Arrivée' : `Étape ${i}`}
          />
        ))}
        {guard && (
          <Marker coordinate={toMap(guard)} title="Garde" anchor={{ x: 0.5, y: 0.5 }}>
            <Dot color={colors.guard} />
          </Marker>
        )}
        {client && (
          <Marker coordinate={toMap(client)} title="Cliente" anchor={{ x: 0.5, y: 0.5 }}>
            <Dot color={colors.client} />
          </Marker>
        )}
        {alert && (
          <Marker coordinate={toMap(alert)} title="Alerte" anchor={{ x: 0.5, y: 0.5 }}>
            <Dot color={colors.danger} size={22} />
          </Marker>
        )}
      </MapView>
    </View>
  );
}

function Dot({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 4,
      }}
    />
  );
}
