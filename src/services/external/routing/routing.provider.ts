import { NormalizedRouteDto } from "../../../types/external";

export interface RoutingProvider {
  readonly providerName: string;
  calculateRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<NormalizedRouteDto>;
}
