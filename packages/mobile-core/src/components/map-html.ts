/**
 * Page HTML de la carte affichée dans une WebView : Leaflet + tuiles servies par l'API HB
 * (OpenStreetMap par défaut). Aucune clé n'est nécessaire dans l'appli : le fournisseur de
 * tuiles se règle sur le serveur.
 *
 * La page reçoit l'état de la carte par `window.hbUpdate(state)` et renvoie les appuis
 * sur la carte par `postMessage`. Aucun texte saisi par les utilisateurs n'y est injecté
 * en HTML : seules des coordonnées, des couleurs et l'adresse des tuiles transitent, et
 * l'attribution du fond de carte est affichée comme du texte.
 */

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';
// Empreintes officielles de Leaflet 1.9.4 (vérifiées contre le paquet npm).
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';

/**
 * Tuiles OpenStreetMap chargées directement par le téléphone : secours quand le serveur ne
 * sert pas le fond de carte (version trop ancienne, ordinateur sans internet).
 */
export const DIRECT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export interface MapState {
  /** Fond de carte : son adresse dépend du serveur choisi dans l'appli. */
  tiles: { url: string; attribution: string; maxZoom: number; fallbackUrl?: string };
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

export function mapHtml(): string {
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
  .hb-tiles-notice { position: absolute; left: 8px; right: 8px; top: 8px; z-index: 1000; display: none;
    background: rgba(255,255,255,.94); color: #625d73; font: 12px -apple-system, Roboto, sans-serif;
    padding: 8px 10px; border-radius: 8px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
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
  var layer = L.layerGroup().addTo(map);
  var fitKey = null;
  var tiles = null;
  var tilesKey = null;

  // Leaflet affiche l'attribution en HTML : on lui passe du texte échappé.
  function text(value) {
    var div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  var tilesNotice = null;
  function notice(message) {
    if (!tilesNotice) {
      tilesNotice = document.createElement('div');
      tilesNotice.className = 'hb-tiles-notice';
      document.body.appendChild(tilesNotice);
    }
    tilesNotice.textContent = message;
    tilesNotice.style.display = message ? 'block' : 'none';
  }

  // Fond de carte du serveur. S'il ne répond pas (serveur trop ancien, ordinateur sans
  // internet), tuiles OpenStreetMap chargées directement, puis un message si rien ne s'affiche.
  function showTiles(url, t, isFallback) {
    if (tiles) map.removeLayer(tiles);
    var loaded = false;
    var errors = 0;
    var current = L.tileLayer(url, { maxZoom: t.maxZoom, attribution: text(t.attribution) });
    current.on('tileload', function () {
      loaded = true;
      notice('');
    });
    current.on('tileerror', function () {
      if (loaded || current !== tiles) return;
      errors += 1;
      if (errors < 4) return;
      if (!isFallback && t.fallbackUrl) showTiles(t.fallbackUrl, t, true);
      else notice('Fond de carte indisponible : vérifiez que le serveur HB est à jour et que l’ordinateur a accès à internet.');
    });
    tiles = current;
    current.addTo(map);
  }

  // Couche recréée seulement si le serveur choisi dans l'appli (ou l'attribution) change.
  function setTiles(t) {
    var key = JSON.stringify(t);
    if (!t || key === tilesKey) return;
    tilesKey = key;
    notice('');
    showTiles(t.url, t, false);
  }

  map.on('click', function (e) { send({ type: 'press', lat: e.latlng.lat, lng: e.latlng.lng }); });

  function dot(color, size) {
    var div = document.createElement('div');
    div.style.cssText = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + color +
      ';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);box-sizing:border-box';
    return L.divIcon({ className: '', html: div.outerHTML, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }

  window.hbUpdate = function (s) {
    setTiles(s.tiles);
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
