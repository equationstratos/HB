import {
  APP_NAME,
  DEFAULT_MAP_ATTRIBUTION,
  MAP_MAX_ZOOM,
  MAP_TILE_PATH,
  type LatLng,
  type Position,
} from '@hb/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { getClient } from '../session';
import { useTheme } from '../theme';
import { DIRECT_TILE_URL, mapHtml, type MapState } from './map-html';

/** Adresse de tuiles imposée à la compilation ; sinon, celles du serveur choisi dans l'appli. */
const TILE_URL_OVERRIDE = process.env.EXPO_PUBLIC_TILE_URL || null;

/** Attribution du fond de carte, demandée une fois par serveur puis gardée en mémoire. */
const attributions = new Map<string, Promise<string>>();

function loadAttribution(origin: string): Promise<string> {
  let request = attributions.get(origin);
  if (!request) {
    request = getClient()
      .api.map.config()
      .then((config) => config.attribution)
      .catch(() => {
        attributions.delete(origin); // nouvel essai au prochain affichage de la carte
        return DEFAULT_MAP_ATTRIBUTION;
      });
    attributions.set(origin, request);
  }
  return request;
}

function useTileAttribution(origin: string | null): string {
  const [loaded, setLoaded] = useState<{ origin: string; text: string } | null>(null);
  useEffect(() => {
    if (!origin) return;
    let active = true;
    void loadAttribution(origin).then((text) => {
      if (active) setLoaded({ origin, text });
    });
    return () => {
      active = false;
    };
  }, [origin]);
  return loaded && loaded.origin === origin ? loaded.text : DEFAULT_MAP_ATTRIBUTION;
}

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
 * Leaflet dans une WebView, sur un fond de carte servi par l'API : aucune clé Google n'est
 * requise, et le fournisseur de tuiles se change sur le serveur sans recompiler l'appli.
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
  const html = useMemo(() => mapHtml(), []);
  // Le serveur peut changer en cours de route (écran « Serveur ») : adresse relue à chaque rendu.
  const origin = TILE_URL_OVERRIDE ? null : getClient().origin;
  const tileUrl = TILE_URL_OVERRIDE ?? `${origin}${MAP_TILE_PATH}`;
  const attribution = useTileAttribution(origin);

  // Seules des coordonnées, les couleurs du thème et le fond de carte sont transmis à la page.
  const state: MapState = useMemo(
    () => ({
      tiles: {
        url: tileUrl,
        attribution,
        maxZoom: MAP_MAX_ZOOM,
        fallbackUrl: TILE_URL_OVERRIDE ? undefined : DIRECT_TILE_URL,
      },
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
    [tileUrl, attribution, line, waypoints, client, guard, alert, colors],
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
        // Page en https://localhost, serveur de test en http : sans cela, Android bloque les tuiles.
        mixedContentMode="always"
        applicationNameForUserAgent={APP_NAME}
        style={{ flex: 1, backgroundColor: colors.surfaceMuted }}
        accessibilityLabel="Carte du trajet"
      />
    </View>
  );
}
