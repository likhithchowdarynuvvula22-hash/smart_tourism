import { RoutingProvider } from "./routing.provider";
import { osrmRoutingProvider } from "./osrm.provider";
import {
  destinationRepository,
  DestinationRepository
} from "../../../repositories/destination.repository";
import { NormalizedRouteDto } from "../../../types/external";
import { isValidUuid } from "../../../utils/validators";
import { BadRequestError, NotFoundError } from "../../../utils/appError";

import { requestCache, RequestCache } from "../../../utils/requestCache";

export class RoutingService {
  constructor(
    private readonly provider: RoutingProvider = osrmRoutingProvider,
    private readonly destRepo: DestinationRepository = destinationRepository
  ) {}

  private validateCoordinates(lat: number, lng: number, label: string): void {
    if (typeof lat !== "number" || isNaN(lat) || lat < -90 || lat > 90) {
      throw new BadRequestError(`Invalid ${label} latitude '${lat}'. Must be between -90 and 90.`);
    }
    if (typeof lng !== "number" || isNaN(lng) || lng < -180 || lng > 180) {
      throw new BadRequestError(
        `Invalid ${label} longitude '${lng}'. Must be between -180 and 180.`
      );
    }
  }

  /**
   * Calculates driving route and travel time between two coordinate pairs.
   */
  async calculateRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<NormalizedRouteDto> {
    this.validateCoordinates(originLat, originLng, "origin");
    this.validateCoordinates(destLat, destLng, "destination");

    if (this.provider !== osrmRoutingProvider) {
      return this.provider.calculateRoute(originLat, originLng, destLat, destLng);
    }

    const cacheKey = RequestCache.keys.route(originLat, originLng, destLat, destLng);
    return requestCache.getOrSet(
      cacheKey,
      () => this.provider.calculateRoute(originLat, originLng, destLat, destLng),
      60000
    );
  }

  /**
   * Calculates driving route between two database destinations by their UUIDs.
   */
  async calculateBetweenDestinations(
    originDestId: string,
    targetDestId: string
  ): Promise<NormalizedRouteDto> {
    if (!isValidUuid(originDestId)) {
      throw new BadRequestError(`Invalid origin destination ID: '${originDestId}'`);
    }
    if (!isValidUuid(targetDestId)) {
      throw new BadRequestError(`Invalid target destination ID: '${targetDestId}'`);
    }

    const [originDest, targetDest] = await Promise.all([
      this.destRepo.findById(originDestId),
      this.destRepo.findById(targetDestId)
    ]);

    if (!originDest) {
      throw new NotFoundError(`Origin destination '${originDestId}' not found`);
    }
    if (!targetDest) {
      throw new NotFoundError(`Target destination '${targetDestId}' not found`);
    }

    if (originDest.latitude === null || originDest.longitude === null) {
      throw new BadRequestError(
        `Origin destination '${originDest.name}' lacks geographic coordinates`
      );
    }
    if (targetDest.latitude === null || targetDest.longitude === null) {
      throw new BadRequestError(
        `Target destination '${targetDest.name}' lacks geographic coordinates`
      );
    }

    return this.calculateRoute(
      originDest.latitude,
      originDest.longitude,
      targetDest.latitude,
      targetDest.longitude
    );
  }
}

export const routingService = new RoutingService();
