import type { LatLng, Position } from '@hb/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTheme } from '../theme';
import { DEFAULT_TILE_URL, mapHtml, type MapState } from './map-html';

const TILE_URL = process.env.EXPO_PUBLIC_TILE_URL ?? DEFAULT_TILE_URL;

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
}

const point = (p: LatLng | null | undefined) => (p ? { lat: p.lat, lng: p.lng } : null);

/**
 * Carte du trajet surveillé : tracé, étapes, cliente et garde.
 * Leaflet dans une WebView, sur fond OpenStreetMap : aucune clé Google n'est requise.
 */
export function RouteMap({
  line,
  waypoints = [],
  client,
  guard,
  alert,
  onPress,
  height = 280,
}: RouteMapProps) {
  const { colors, radius } = useTheme();
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => mapHtml(TILE_URL), []);

  // Seules des coordonnées et les couleurs du thème sont transmises à la page.
  const state: MapState = useMemo(
    () => ({
      line: (line ?? []).map(([lng, lat]) => [lng, lat] as [number, number]),
      waypoints: waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
      client: point(client),
      guard: point(guard),
      alert: point(alert),
      colors: {
        route: colors.route,
        client: colors.client,
        guard: colors.guard,
        danger: colors.danger,
        start: colors.success,
        end: colors.primary,
        stop: colors.warning,
      },
    }),
    [line, waypoints, client, guard, alert, colors],
  );

  useEffect(() => {
    if (!ready) return;
    ref.current?.injectJavaScript(
      `window.hbUpdate && window.hbUpdate(${JSON.stringify(state)}); true;`,
    );
  }, [ready, state]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type: string;
        lat?: number;
        lng?: number;
      };
      if (message.type === 'ready') setReady(true);
      if (
        message.type === 'press' &&
        typeof message.lat === 'number' &&
        typeof message.lng === 'number'
      ) {
        onPress?.({ lat: message.lat, lng: message.lng });
      }
    } catch {
      /* message inattendu : ignoré */
    }
  };

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
      <WebView
        ref={ref}
        source={{ html, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        style={{ flex: 1, backgroundColor: colors.surfaceMuted }}
        accessibilityLabel="Carte du trajet"
      />
    </View>
  );
}
