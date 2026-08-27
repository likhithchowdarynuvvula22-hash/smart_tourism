import { GeocodingProvider } from "./geocoding.provider";
import { GeocodeLocationDto } from "../../../types/external";
import { httpGet } from "../../../utils/httpClient";

interface OpenMeteoGeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string; // State / Province
  admin2?: string; // District / County
}

interface OpenMeteoGeocodingResponse {
  results?: OpenMeteoGeocodingResult[];
}

export class OpenMeteoGeocodingProvider implements GeocodingProvider {
  readonly providerName = "Open-Meteo Geocoding";
  private readonly baseUrl = "https://geocoding-api.open-meteo.com/v1/search";

  async search(query: string, limit: number = 5): Promise<GeocodeLocationDto[]> {
    const raw = await httpGet<OpenMeteoGeocodingResponse>(this.baseUrl, {
      params: {
        name: query,
        count: limit,
        language: "en",
        format: "json"
      },
      timeoutMs: 5000
    });

    if (!raw.results || raw.results.length === 0) {
      return [];
    }

    return raw.results.map((item) => {
      const parts = [item.name, item.admin2, item.admin1, item.country].filter(Boolean);
      return {
        name: item.name,
        latitude: item.latitude,
        longitude: item.longitude,
        country: item.country,
        admin1: item.admin1,
        admin2: item.admin2,
        countryCode: item.country_code,
        formattedAddress: parts.join(", ")
      };
    });
  }
}

export const openMeteoGeocodingProvider = new OpenMeteoGeocodingProvider();
