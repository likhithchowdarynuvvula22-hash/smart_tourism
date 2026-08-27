import { GeocodingProvider } from "./geocoding.provider";
import { openMeteoGeocodingProvider } from "./openMeteoGeocoding.provider";
import { GeocodeLocationDto } from "../../../types/external";
import { BadRequestError } from "../../../utils/appError";

export class GeocodingService {
  constructor(private readonly provider: GeocodingProvider = openMeteoGeocodingProvider) {}

  /**
   * Searches for coordinates by place name or address query.
   */
  async search(query: string, limit: number = 5): Promise<GeocodeLocationDto[]> {
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      throw new BadRequestError("Geocoding query must be at least 2 characters long");
    }

    const boundedLimit = Math.max(1, Math.min(limit, 20));
    return this.provider.search(query.trim(), boundedLimit);
  }
}

export const geocodingService = new GeocodingService();
