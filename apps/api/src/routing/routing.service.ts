import { Inject, Injectable, Logger } from '@nestjs/common';
import { ComputedRoute, RouteRequestInput, straightLineRoute } from '@hb/shared';
import { ROUTING_PROVIDER, RoutingProvider } from '../integrations/routing.provider';

/**
 * Calcul d'itinéraire. Les transports en commun sont tracés étape par étape (arrêts placés
 * par la cliente) ; en cas de panne du fournisseur, on retombe sur une approximation.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(@Inject(ROUTING_PROVIDER) private readonly provider: RoutingProvider) {}

  async compute(input: RouteRequestInput): Promise<ComputedRoute> {
    if (input.mode === 'TRANSIT') return straightLineRoute(input.points, input.mode);
    try {
      return await this.provider.compute(input.points, input.mode);
    } catch (error) {
      this.logger.warn(
        `Itinéraire ${this.provider.name} indisponible, approximation utilisée : ${String(error)}`,
      );
      return straightLineRoute(input.points, input.mode);
    }
  }
}
