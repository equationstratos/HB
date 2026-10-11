import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';

export interface Tile {
  data: Buffer;
  contentType: string;
}

interface CachedTile extends Tile {
  expiresAt: number;
}

/** Durée de conservation d'une tuile, en mémoire comme dans le cache des téléphones. */
export const TILE_TTL_SECONDS = 7 * 24 * 3600;
/** Tuiles gardées en mémoire : quelques dizaines de Ko chacune, soit 20 à 50 Mo au plus. */
export const TILE_CACHE_MAX_ENTRIES = 1000;
/** Une tuile pèse quelques dizaines de Ko : au-delà, la réponse du fournisseur est suspecte. */
const MAX_TILE_BYTES = 1024 * 1024;
const TIMEOUT_MS = 10_000;

/** Adresse d'une tuile chez le fournisseur, d'après le modèle MAP_TILE_URL. */
export function upstreamTileUrl(template: string, z: number, x: number, y: number): string {
  const values: Record<string, string> = {
    z: String(z),
    x: String(x),
    y: String(y),
    // Même répartition que Leaflet entre les sous-domaines a, b et c.
    s: 'abc'[(x + y) % 3]!,
    // Pas de tuiles haute densité (« @2x ») : le format reste celui annoncé.
    r: '',
  };
  return template.replace(/\{([zxysr])\}/g, (_, key: string) => values[key]!);
}

/**
 * Tuiles du fond de carte, relayées depuis le fournisseur configuré : sa clé éventuelle reste
 * sur le serveur, et on peut en changer sans recompiler les applis. Cache en mémoire (LRU),
 * et une seule requête au fournisseur pour plusieurs demandes simultanées de la même tuile.
 */
@Injectable()
export class MapTilesService {
  private readonly logger = new Logger(MapTilesService.name);
  private readonly cache = new Map<string, CachedTile>();
  private readonly pending = new Map<string, Promise<Tile>>();
  private lastWarningAt = 0;

  constructor(private readonly config: AppConfig) {}

  /** Coordonnées déjà validées par le contrôleur. */
  tile(z: number, x: number, y: number): Promise<Tile> {
    const key = `${z}/${x}/${y}`;
    const cached = this.fromCache(key);
    if (cached) return Promise.resolve(cached);

    let pending = this.pending.get(key);
    if (!pending) {
      // Un échec n'est pas mis en cache : la tuile sera redemandée au prochain affichage.
      pending = this.download(z, x, y)
        .then((tile) => {
          this.store(key, tile);
          return tile;
        })
        .finally(() => this.pending.delete(key));
      this.pending.set(key, pending);
    }
    return pending;
  }

  private fromCache(key: string): Tile | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    this.cache.delete(key);
    if (entry.expiresAt <= Date.now()) return null;
    // Remise en fin de file : les tuiles les plus vues restent en mémoire.
    this.cache.set(key, entry);
    return entry;
  }

  private store(key: string, tile: Tile): void {
    this.cache.set(key, { ...tile, expiresAt: Date.now() + TILE_TTL_SECONDS * 1000 });
    for (const oldest of this.cache.keys()) {
      if (this.cache.size <= TILE_CACHE_MAX_ENTRIES) break;
      this.cache.delete(oldest);
    }
  }

  private async download(z: number, x: number, y: number): Promise<Tile> {
    try {
      const res = await fetch(upstreamTileUrl(this.config.get('MAP_TILE_URL'), z, x, y), {
        headers: {
          'User-Agent': this.config.get('MAP_TILE_USER_AGENT'),
          Accept: 'image/png,image/*;q=0.8',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const contentType = res.headers.get('content-type') ?? '';
      const length = Number(res.headers.get('content-length') ?? 0);
      // Une page d'erreur HTML ne doit jamais être resservie depuis l'origine de l'API.
      if (!res.ok || !/^image\//i.test(contentType) || length > MAX_TILE_BYTES) {
        await res.body?.cancel();
        throw new Error(`réponse ${res.status} (${contentType || 'type inconnu'})`);
      }
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length === 0 || data.length > MAX_TILE_BYTES) {
        throw new Error(`tuile de ${data.length} octets`);
      }
      return { data, contentType };
    } catch (error) {
      this.warn(error);
      throw new BadGatewayException('Fond de carte momentanément indisponible');
    }
  }

  /**
   * Un avertissement par minute au plus : une carte demande des dizaines de tuiles à la fois.
   * L'adresse du fournisseur n'est jamais journalisée, elle peut contenir une clé.
   */
  private warn(error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarningAt < 60_000) return;
    this.lastWarningAt = now;
    const reason = error instanceof Error ? error.message : String(error);
    // « fetch failed » seul ne dit rien : la cause indique DNS, connexion refusée, etc.
    const cause =
      error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';
    this.logger.warn(`Fournisseur de tuiles indisponible : ${reason}${cause}`);
  }
}
