import { RoutingProvider } from "./routing.provider";
import { NormalizedRouteDto } from "../../../types/external";
import { httpGet } from "../../../utils/httpClient";
import { BadGatewayError } from "../../../utils/appError";

interface OsrmRoute {
  distance: number; // in meters
  duration: number; // in seconds
  weight_name?: string;
  weight?: number;
  geometry?: string;
  legs?: Array<{
    summary?: string;
    distance: number;
    duration: number;
  }>;
}

interface OsrmResponse {
  code: string;
  routes?: OsrmRoute[];
  message?: string;
}

/**
 * OSRM Routing Provider (Open Source Routing Machine Demo Server Adapter)
 *
 * STATUS & ISOLATION:
 * - Public Demo Server: Free open-access routing engine based on OpenStreetMap Indian roads.
 * - Provider Isolation: Strictly encapsulates all low-level URL building and geometry extraction
 *   behind the abstract `RoutingProvider` interface.
 * - Extensibility: Can be switched to a self-hosted OSRM instance or OpenRouteService / Mapbox
 *   in production without changing application services or controllers.
 */
export class OsrmRoutingProvider implements RoutingProvider {
  readonly providerName = "OSRM (Open Source Routing Machine Demo)";
  private readonly baseUrl = "https://router.project-osrm.org/route/v1/driving";

  async calculateRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<NormalizedRouteDto> {
    // OSRM expects coordinates in "longitude,latitude;longitude,latitude" format
    const coordinates = `${originLng},${originLat};${destLng},${destLat}`;
    const url = `${this.baseUrl}/${coordinates}`;

    const raw = await httpGet<OsrmResponse>(url, {
      params: {
        overview: "false",
        steps: "false"
      },
      timeoutMs: 6000
    });

    if (raw.code !== "Ok" || !raw.routes || raw.routes.length === 0) {
      throw new BadGatewayError(
        `OSRM routing failed: ${raw.message || raw.code || "No route found"}`
      );
    }

    const primaryRoute = raw.routes[0];
    const distanceMeters = Math.round(primaryRoute.distance);
    const durationSeconds = Math.round(primaryRoute.duration);

    return {
      origin: { latitude: originLat, longitude: originLng },
      destination: { latitude: destLat, longitude: destLng },
      distanceMeters,
      distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
      durationSeconds,
      durationMinutes: Math.round(durationSeconds / 60),
      summary: primaryRoute.legs?.[0]?.summary || "Driving route via highways / roads",
      geometry: primaryRoute.geometry || null,
      provider: this.providerName,
      retrievedAt: new Date().toISOString()
    };
  }
}

export const osrmRoutingProvider = new OsrmRoutingProvider();
