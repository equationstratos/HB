/**
 * Page HTML de la carte affichée dans une WebView : Leaflet + tuiles OpenStreetMap.
 * Aucune clé d'API n'est nécessaire (contrairement à Google Maps sur Android).
 *
 * La page reçoit l'état de la carte par `window.hbUpdate(state)` et renvoie les appuis
 * sur la carte par `postMessage`. Aucun texte saisi par les utilisateurs n'y est injecté
 * en HTML : seules des coordonnées et des couleurs transitent.
 */

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';
// Empreintes officielles de Leaflet 1.9.4 (vérifiées contre le paquet npm).
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';

/** Fond de carte par défaut : CARTO Voyager (données OpenStreetMap), sans clé. */
export const DEFAULT_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const DEFAULT_ATTRIBUTION = '&copy; OpenStreetMap &copy; CARTO';

export interface MapState {
  /** Tracé : [lng, lat][] (GeoJSON). */
  line: [number, number][];
  /** Départ, étapes, arrivée. */
  waypoints: { lat: number; lng: number }[];
  client: { lat: number; lng: number } | null;
  guard: { lat: number; lng: number } | null;
  alert: { lat: number; lng: number } | null;
  colors: {
    route: string;
    client: string;
    guard: string;
    danger: string;
    start: string;
    end: string;
    stop: string;
  };
}

export function mapHtml(tileUrl = DEFAULT_TILE_URL, attribution = DEFAULT_ATTRIBUTION): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css" integrity="${LEAFLET_CSS_SRI}" crossorigin="">
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #e8e6ef; }
  .leaflet-control-attribution { font-size: 9px; }
  .hb-offline { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font: 14px -apple-system, Roboto, sans-serif; color: #625d73; text-align: center; padding: 16px; }
</style>
</head><body>
<div id="map"></div>
<script src="${LEAFLET}/leaflet.js" integrity="${LEAFLET_JS_SRI}" crossorigin=""></script>
<script>
(function () {
  function send(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  if (typeof L === 'undefined') {
    document.getElementById('map').innerHTML = '<div class="hb-offline">Carte indisponible : vérifiez la connexion internet.</div>';
    window.hbUpdate = function () {};
    send({ type: 'ready' });
    return;
  }
  var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([48.8566, 2.3522], 13);
  L.tileLayer(${JSON.stringify(tileUrl)}, { maxZoom: 19, subdomains: 'abcd', attribution: ${JSON.stringify(attribution)} }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var fitKey = null;

  map.on('click', function (e) { send({ type: 'press', lat: e.latlng.lat, lng: e.latlng.lng }); });

  function dot(color, size) {
    var div = document.createElement('div');
    div.style.cssText = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + color +
      ';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);box-sizing:border-box';
    return L.divIcon({ className: '', html: div.outerHTML, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }

  window.hbUpdate = function (s) {
    layer.clearLayers();
    var c = s.colors;
    var line = (s.line || []).map(function (p) { return [p[1], p[0]]; });
    if (line.length > 1) L.polyline(line, { color: c.route, weight: 5, opacity: 0.9 }).addTo(layer);
    var n = (s.waypoints || []).length;
    (s.waypoints || []).forEach(function (w, i) {
      var color = i === 0 ? c.start : i === n - 1 ? c.end : c.stop;
      L.circleMarker([w.lat, w.lng], { radius: i === n - 1 ? 8 : 6, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 }).addTo(layer);
    });
    if (s.guard) L.marker([s.guard.lat, s.guard.lng], { icon: dot(c.guard, 18) }).addTo(layer);
    if (s.client) L.marker([s.client.lat, s.client.lng], { icon: dot(c.client, 18), zIndexOffset: 500 }).addTo(layer);
    if (s.alert) L.marker([s.alert.lat, s.alert.lng], { icon: dot(c.danger, 24), zIndexOffset: 1000 }).addTo(layer);

    // Recadrage uniquement quand le trajet change, pas à chaque position reçue.
    var key = JSON.stringify([line.length, line[0], line[line.length - 1], s.waypoints]);
    if (key !== fitKey) {
      fitKey = key;
      var pts = line.concat((s.waypoints || []).map(function (w) { return [w.lat, w.lng]; }));
      if (pts.length === 1) map.setView(pts[0], 15);
      else if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 16 });
      else if (s.client) map.setView([s.client.lat, s.client.lng], 15);
    }
  };
  send({ type: 'ready' });
})();
</script>
</body></html>`;
}
