export interface CurrentWeatherDto {
  temperatureC: number;
  apparentTemperatureC?: number;
  humidityPercent?: number;
  precipitationMm?: number;
  precipitationProbabilityPercent?: number;
  windSpeedKmh?: number;
  weatherCode: number;
  weatherDescription: string;
  isDay: boolean;
  time: string;
}

export interface DailyForecastItemDto {
  date: string;
  weatherCode: number;
  weatherDescription: string;
  maxTempC: number;
  minTempC: number;
  precipitationSumMm?: number;
  precipitationProbabilityMaxPercent?: number;
  uvIndexMax?: number;
}

export interface NormalizedWeatherDto {
  destinationId?: string;
  destinationName?: string;
  latitude: number;
  longitude: number;
  elevationMeters?: number;
  timezone: string;
  current: CurrentWeatherDto;
  dailyForecast: DailyForecastItemDto[];
  source: {
    provider: string;
    retrievedAt: string;
  };
}

export interface GeocodeLocationDto {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string; // State
  admin2?: string; // District
  countryCode?: string;
  formattedAddress?: string;
}

export interface NormalizedRouteDto {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  summary?: string;
  geometry?: string | null;
  provider: string;
  retrievedAt: string;
}

export interface NormalizedTranslationDto {
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  matchQuality?: number;
  provider: string;
  retrievedAt: string;
}
