import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MAP_MAX_ZOOM, MAP_TILE_PATH, MapConfigDto } from '@hb/shared';
import { Response } from 'express';
import { z } from 'zod';
import { Public } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AppConfig } from '../config/app-config.service';
import { MapTilesService, TILE_TTL_SECONDS } from './map-tiles.service';

/** Entier écrit sans signe ni zéro superflu : « 012 », « 1e3 » ou « 1.0 » sont refusés. */
const coordinate = z
  .string()
  .regex(/^(0|[1-9]\d{0,6})$/, 'Entier attendu')
  .transform(Number);

const tileParamsSchema = z
  .object({ z: coordinate, x: coordinate, y: coordinate })
  .refine((p) => p.z <= MAP_MAX_ZOOM, {
    message: `Zoom compris entre 0 et ${MAP_MAX_ZOOM}`,
    path: ['z'],
  })
  .refine((p) => p.x < 2 ** p.z && p.y < 2 ** p.z, {
    message: 'Tuile hors de la carte',
    path: ['x'],
  });
type TileParams = z.infer<typeof tileParamsSchema>;

/** Une carte charge 20 à 60 tuiles d'un coup : limite large, propre à cette route. */
const TILES_THROTTLE = { default: { limit: 1200, ttl: 60_000 } };

@ApiTags('Carte')
@Public()
@Controller('map')
export class MapController {
  constructor(
    private readonly tiles: MapTilesService,
    private readonly config: AppConfig,
  ) {}

  /** Réglages du fond de carte : les applis en tirent l'attribution à afficher. */
  @Get('config')
  mapConfig(): MapConfigDto {
    return {
      tileUrl: MAP_TILE_PATH,
      attribution: this.config.get('MAP_TILE_ATTRIBUTION'),
      maxZoom: MAP_MAX_ZOOM,
    };
  }

  /**
   * Tuile du fond de carte. Publique : les images chargées par Leaflet, dans l'admin comme
   * dans la WebView des applis, ne peuvent pas porter de jeton.
   */
  @Get('tiles/:z/:x/:y.png')
  @Throttle(TILES_THROTTLE)
  async tile(
    @Param(new ZodPipe(tileParamsSchema)) params: TileParams,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const tile = await this.tiles.tile(params.z, params.x, params.y);
    res.set({
      'Content-Type': tile.contentType,
      'Cache-Control': `public, max-age=${TILE_TTL_SECONDS}`,
      // helmet impose « same-origin » : la page de la carte des applis (https://localhost)
      // n'afficherait aucune tuile d'un serveur à une autre adresse.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    return new StreamableFile(tile.data);
  }
}
