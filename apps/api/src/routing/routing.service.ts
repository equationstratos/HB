import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ComputedRoute,
  MODE_SPEED_MPS,
  Position,
  RouteRequestInput,
  RouteWaypoint,
  straightLineRoute,
} from '@hb/shared';
import { ROUTING_PROVIDER, RoutingProvider } from '../integrations/routing.provider';

interface TransitLeg {
  coordinates: Position[];
  distanceMeters: number;
  approximate: boolean;
}

/**
 * Calcul d'itinéraire. Les transports en commun sont tracés étape par étape (arrêts placés
 * par la cliente) ; en cas de panne du fournisseur, on retombe sur une approximation en lignes
 * droites, signalée par `approximate`.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(@Inject(ROUTING_PROVIDER) private readonly provider: RoutingProvider) {}

  async compute(input: RouteRequestInput): Promise<ComputedRoute> {
    if (input.mode === 'TRANSIT') return this.transit(input.points);
    try {
      return await this.provider.compute(input.points, input.mode);
    } catch (error) {
      this.logger.warn(
        `Itinéraire ${this.provider.name} indisponible, approximation utilisée : ${String(error)}`,
      );
      return straightLineRoute(input.points, input.mode);
    }
  }

  /**
   * Transports en commun : sans horaires ni lignes, chaque tronçon d'un arrêt au suivant est
   * tracé dans les rues (profil piéton) pour suivre le couloir réel du trajet. La durée reste
   * estimée comme pour une ligne droite (vitesse moyenne des transports) sur la distance tracée.
   * Les tronçons (9 au plus) sont demandés en parallèle : une panne ne coûte qu'un délai d'attente.
   */
  private async transit(points: RouteWaypoint[]): Promise<ComputedRoute> {
    const legs = await Promise.all(
      points.slice(1).map((to, i) => this.transitLeg(points[i]!, to, i + 1, points.length - 1)),
    );
    const coordinates: Position[] = [];
    for (const leg of legs) {
      const last = coordinates[coordinates.length - 1];
      const [first, ...rest] = leg.coordinates;
      // Le tronçon suivant repart du point d'arrivée du précédent : pas de doublon.
      const same = last && first && last[0] === first[0] && last[1] === first[1];
      coordinates.push(...(same ? rest : leg.coordinates));
    }
    const distanceMeters = legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
    return {
      mode: 'TRANSIT',
      geometry: { type: 'LineString', coordinates },
      distanceMeters,
      durationSeconds: Math.round(distanceMeters / MODE_SPEED_MPS.TRANSIT),
      approximate: legs.some((leg) => leg.approximate),
      provider: legs.every((leg) => leg.approximate) ? 'straight-line' : this.provider.name,
    };
  }

  /** Un tronçon dans les rues ; en cas d'échec, une ligne droite pour ce tronçon seulement. */
  private async transitLeg(
    from: RouteWaypoint,
    to: RouteWaypoint,
    n: number,
    total: number,
  ): Promise<TransitLeg> {
    try {
      const leg = await this.provider.compute([from, to], 'WALK');
      // Un tracé déjà approximatif (fournisseur « straight ») cède la place à l'estimation
      // propre aux transports, sans alerte : c'est la configuration choisie.
      if (!leg.approximate) {
        return {
          coordinates: leg.geometry.coordinates,
          distanceMeters: leg.distanceMeters,
          approximate: false,
        };
      }
    } catch (error) {
      this.logger.warn(
        `Tronçon ${n}/${total} en transports non tracé par ${this.provider.name}, ligne droite utilisée : ${String(error)}`,
      );
    }
    const straight = straightLineRoute([from, to], 'TRANSIT');
    return {
      coordinates: straight.geometry.coordinates,
      distanceMeters: straight.distanceMeters,
      approximate: true,
    };
  }
}
