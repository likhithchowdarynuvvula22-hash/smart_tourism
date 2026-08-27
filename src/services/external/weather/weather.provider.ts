import { NormalizedWeatherDto } from "../../../types/external";

export interface WeatherProvider {
  readonly providerName: string;
  fetchForecast(latitude: number, longitude: number, date?: string): Promise<NormalizedWeatherDto>;
}
