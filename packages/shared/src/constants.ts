/** Prix indicatif d'une protection ponctuelle (aucun encaissement en v1). */
export const ONE_OFF_PRICE_CENTS = 1500;

/** Note moyenne sous laquelle un garde est signalé à l'admin. */
export const LOW_RATING_THRESHOLD = 3.5;
/** Nombre minimal de notes avant de signaler un garde. */
export const LOW_RATING_MIN_COUNT = 3;

/** Les positions GPS sont supprimées ce nombre de jours après la fin de la mission (RGPD). */
export const LOCATION_RETENTION_DAYS = 30;

/** Taille maximale d'une pièce justificative. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOCUMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

/**
 * Fond de carte : tuiles relayées par l'API, à l'adresse du serveur (ex. http://192.168.1.20:3000).
 * Le fournisseur et son éventuelle clé se règlent côté serveur (MAP_TILE_URL).
 */
export const MAP_TILE_PATH = '/api/map/tiles/{z}/{x}/{y}.png';
export const MAP_MAX_ZOOM = 19;
/** Attribution par défaut : les données cartographiques viennent d'OpenStreetMap. */
export const DEFAULT_MAP_ATTRIBUTION = '© contributeurs OpenStreetMap';

/**
 * Mots de code : la cliente et le garde se reconnaissent sans avoir à donner leur nom.
 */
export const CODE_WORDS = [
  'Lavande',
  'Horizon',
  'Mistral',
  'Boussole',
  'Cerisier',
  'Albatros',
  'Opale',
  'Marelle',
  'Lanterne',
  'Coquelicot',
  'Azur',
  'Sésame',
  'Phare',
  'Mimosa',
  'Galet',
  'Comète',
  'Ondine',
  'Pivoine',
  'Origami',
  'Cascade',
  'Vanille',
  'Brindille',
  'Aquarelle',
  'Sirocco',
] as const;

/** Numéros d'urgence en France. */
export const EMERGENCY_NUMBERS = {
  european: '112',
  police: '17',
  sms: '114',
} as const;

/** Nom affiché de la plateforme (SMS, appels, écrans). À adapter à la marque définitive. */
export const APP_NAME = 'HB';

/**
 * Niveau de l'API, renvoyé par GET /api/health : augmenté quand les applis ont besoin d'un
 * serveur plus récent. 2 : fond de carte servi par l'API, cagnotte des gardes, notifications
 * de statut dans les applis.
 */
export const API_LEVEL = 2;
/** Niveau d'API attendu par les applis : en dessous, elles demandent de mettre le serveur à jour. */
export const REQUIRED_API_LEVEL = 2;
