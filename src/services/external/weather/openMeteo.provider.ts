import { WeatherProvider } from "./weather.provider";
import { NormalizedWeatherDto, DailyForecastItemDto } from "../../../types/external";
import { httpGet } from "../../../utils/httpClient";

const WMO_WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail"
};

export const getWeatherDescription = (code: number): string => {
  return WMO_WEATHER_CODES[code] || `Weather condition (Code: ${code})`;
};

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  elevation?: number;
  timezone: string;
  current?: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    is_day?: number;
    precipitation?: number;
    weather_code: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
    uv_index_max?: number[];
  };
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly providerName = "Open-Meteo";
  private readonly baseUrl = "https://api.open-meteo.com/v1/forecast";

  async fetchForecast(
    latitude: number,
    longitude: number,
    date?: string
  ): Promise<NormalizedWeatherDto> {
    const params: Record<string, string | number | boolean | undefined> = {
      latitude,
      longitude,
      current:
        "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max",
      timezone: "auto"
    };

    if (date) {
      params.start_date = date;
      params.end_date = date;
    }

    const raw = await httpGet<OpenMeteoResponse>(this.baseUrl, {
      params,
      timeoutMs: 6000
    });

    const current = raw.current || {
      time: new Date().toISOString(),
      temperature_2m: 0,
      weather_code: 0
    };

    const dailyForecast: DailyForecastItemDto[] = [];
    if (raw.daily && raw.daily.time) {
      for (let i = 0; i < raw.daily.time.length; i++) {
        const code = raw.daily.weather_code[i] ?? 0;
        dailyForecast.push({
          date: raw.daily.time[i],
          weatherCode: code,
          weatherDescription: getWeatherDescription(code),
          maxTempC: raw.daily.temperature_2m_max[i] ?? 0,
          minTempC: raw.daily.temperature_2m_min[i] ?? 0,
          precipitationSumMm: raw.daily.precipitation_sum?.[i],
          precipitationProbabilityMaxPercent: raw.daily.precipitation_probability_max?.[i],
          uvIndexMax: raw.daily.uv_index_max?.[i]
        });
      }
    }

    return {
      latitude: raw.latitude,
      longitude: raw.longitude,
      elevationMeters: raw.elevation,
      timezone: raw.timezone,
      current: {
        temperatureC: current.temperature_2m,
        apparentTemperatureC: current.apparent_temperature,
        humidityPercent: current.relative_humidity_2m,
        precipitationMm: current.precipitation,
        precipitationProbabilityPercent: dailyForecast[0]?.precipitationProbabilityMaxPercent,
        windSpeedKmh: current.wind_speed_10m,
        weatherCode: current.weather_code,
        weatherDescription: getWeatherDescription(current.weather_code),
        isDay: current.is_day === 1,
        time: current.time
      },
      dailyForecast,
      source: {
        provider: this.providerName,
        retrievedAt: new Date().toISOString()
      }
    };
  }
}

export const openMeteoWeatherProvider = new OpenMeteoWeatherProvider();
