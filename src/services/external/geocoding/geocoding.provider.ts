import { GeocodeLocationDto } from "../../../types/external";

export interface GeocodingProvider {
  readonly providerName: string;
  search(query: string, limit?: number): Promise<GeocodeLocationDto[]>;
}
