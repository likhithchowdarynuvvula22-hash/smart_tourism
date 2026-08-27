import { WeatherProvider } from "./weather.provider";
import { openMeteoWeatherProvider } from "./openMeteo.provider";
import {
  destinationRepository,
  DestinationRepository
} from "../../../repositories/destination.repository";
import { NormalizedWeatherDto } from "../../../types/external";
import { isValidUuid } from "../../../utils/validators";
import { BadRequestError, NotFoundError } from "../../../utils/appError";
import { logger } from "../../../lib/logger";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class WeatherService {
  constructor(
    private readonly provider: WeatherProvider = openMeteoWeatherProvider,
    private readonly destRepo: DestinationRepository = destinationRepository
  ) {}

  /**
   * Validates optional travel date against format and forecast horizon (up to 16 days).
   */
  private validateDate(dateStr?: string): void {
    if (!dateStr) return;

    if (!DATE_REGEX.test(dateStr)) {
      throw new BadRequestError(`Invalid date format: '${dateStr}'. Expected YYYY-MM-DD format.`);
    }

    const requestedDate = new Date(dateStr);
    if (isNaN(requestedDate.getTime())) {
      throw new BadRequestError(`Invalid calendar date: '${dateStr}'`);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const maxForecastDate = new Date();
    maxForecastDate.setDate(maxForecastDate.getDate() + 16);

    if (requestedDate < today) {
      // Historical or past date
      logger.debug({ dateStr }, "Requested past date for weather");
    } else if (requestedDate > maxForecastDate) {
      throw new BadRequestError(
        `Requested date '${dateStr}' is beyond the 16-day live forecast horizon.`
      );
    }
  }

  private readonly forecastCache: Map<string, { data: NormalizedWeatherDto; expiresAt: number }> =
    new Map();

  /**
   * Fetches weather for a destination by resolving real coordinates from Supabase.
   */
  async getDestinationWeather(destinationId: string, date?: string): Promise<NormalizedWeatherDto> {
    if (!isValidUuid(destinationId)) {
      throw new BadRequestError(`Invalid destination ID format: '${destinationId}'`);
    }

    this.validateDate(date);

    const cacheKey = `${destinationId}:${date ?? "live"}`;
    const cached = this.forecastCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const destination = await this.destRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found`);
    }

    if (destination.latitude === null || destination.longitude === null) {
      throw new BadRequestError(
        `Destination '${destination.name}' does not have geographic coordinates configured`
      );
    }

    const weather = await this.provider.fetchForecast(
      destination.latitude,
      destination.longitude,
      date
    );

    const result: NormalizedWeatherDto = {
      ...weather,
      destinationId: destination.id,
      destinationName: destination.name
    };

    this.forecastCache.set(cacheKey, { data: result, expiresAt: Date.now() + 60000 });
    return result;
  }
}

export const weatherService = new WeatherService();
