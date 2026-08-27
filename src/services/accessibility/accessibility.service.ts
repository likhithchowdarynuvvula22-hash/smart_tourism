import {
  DestinationRepository,
  destinationRepository
} from "../../repositories/destination.repository";
import { TourismRepository, tourismRepository } from "../../repositories/tourism.repository";
import { AccessibilityAnalyzer, accessibilityAnalyzer } from "./analyzers/accessibility.analyzer";
import { ElderlyTravelAnalyzer, elderlyTravelAnalyzer } from "./analyzers/elderlyTravel.analyzer";
import { WeatherService, weatherService } from "../external/weather/weather.service";
import {
  DestinationAccessibilityAssessmentDto,
  AttractionAccessibilityDto,
  DestinationElderlyAssessmentDto
} from "../../types/accessibility";
import { NotFoundError, BadRequestError } from "../../utils/appError";
import { validateUUID } from "../../utils/validators";
import { logger } from "../../lib/logger";

export class AccessibilityService {
  constructor(
    private readonly destRepo: DestinationRepository = destinationRepository,
    private readonly tourRepo: TourismRepository = tourismRepository,
    private readonly accAnalyzer: AccessibilityAnalyzer = accessibilityAnalyzer,
    private readonly eldAnalyzer: ElderlyTravelAnalyzer = elderlyTravelAnalyzer,
    private readonly weatherSvc: WeatherService = weatherService
  ) {}

  /**
   * Retrieves grounded destination-level accessibility intelligence.
   */
  async getDestinationAccessibility(
    destinationId: string,
    targetDate?: string
  ): Promise<DestinationAccessibilityAssessmentDto> {
    if (!validateUUID(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID format: '${destinationId}'. Must be a valid UUID.`
      );
    }

    const destination = await this.destRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found`);
    }

    // Retrieve relational attractions and accessibility features
    const attractions = await this.tourRepo.findAttractionsByDestinationId(destinationId);
    const accessibilityRows = await this.tourRepo.findAccessibilityByDestinationId(destinationId);

    // Weather forecast integration (optional context, resilient to failures)
    let weatherForecast: {
      precipitationProbability?: number | null;
      weatherCondition?: string | null;
    } | null = null;
    try {
      const weather = await this.weatherSvc.getDestinationWeather(destinationId, targetDate);
      if (weather) {
        weatherForecast = {
          precipitationProbability:
            weather.dailyForecast?.[0]?.precipitationProbabilityMaxPercent ?? null,
          weatherCondition: weather.current?.weatherDescription ?? null
        };
      }
    } catch (err) {
      logger.warn(
        { err, destinationId },
        "Weather service lookup skipped for accessibility assessment"
      );
    }

    return this.accAnalyzer.assess({
      destinationId: destination.id,
      destinationName: destination.name,
      state: destination.state,
      targetDate: targetDate || new Date().toISOString().split("T")[0],
      attractions: attractions.map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        description: a.description
      })),
      accessibilityRows,
      weatherForecast
    });
  }

  /**
   * Retrieves attraction-level accessibility features for all attractions belonging to a destination.
   */
  async getAttractionAccessibility(destinationId: string): Promise<AttractionAccessibilityDto[]> {
    const assessment = await this.getDestinationAccessibility(destinationId);
    return [
      ...assessment.suitableAttractions,
      ...assessment.limitedAttractions,
      ...assessment.unknownAttractions,
      ...assessment.unsupportedAttractions
    ];
  }

  /**
   * Retrieves grounded senior citizen and elderly travel suitability assessment.
   */
  async getDestinationElderlySuitability(
    destinationId: string,
    targetDate?: string
  ): Promise<DestinationElderlyAssessmentDto> {
    if (!validateUUID(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID format: '${destinationId}'. Must be a valid UUID.`
      );
    }

    const destination = await this.destRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found`);
    }

    // Retrieve relational attractions, elderly support, accessibility, opening hours, and fees
    const attractions = await this.tourRepo.findAttractionsByDestinationId(destinationId);
    const elderlySupportRows = await this.tourRepo.findElderlySupportByDestinationId(destinationId);
    const accessibilityRows = await this.tourRepo.findAccessibilityByDestinationId(destinationId);
    const openingHoursRows = await this.tourRepo.findOpeningHoursByDestinationId(destinationId);
    const entryFeesRows = await this.tourRepo.findEntryFeesByDestinationId(destinationId);

    // Weather forecast integration
    let weatherForecast: {
      precipitationProbability?: number | null;
      temperatureMax?: number | null;
      temperatureMin?: number | null;
      weatherCondition?: string | null;
    } | null = null;

    try {
      const weather = await this.weatherSvc.getDestinationWeather(destinationId, targetDate);
      if (weather) {
        weatherForecast = {
          precipitationProbability:
            weather.dailyForecast?.[0]?.precipitationProbabilityMaxPercent ?? null,
          temperatureMax: weather.dailyForecast?.[0]?.maxTempC ?? null,
          temperatureMin: weather.dailyForecast?.[0]?.minTempC ?? null,
          weatherCondition: weather.current?.weatherDescription ?? null
        };
      }
    } catch (err) {
      logger.warn(
        { err, destinationId },
        "Weather service lookup skipped for elderly travel assessment"
      );
    }

    return this.eldAnalyzer.assess({
      destinationId: destination.id,
      destinationName: destination.name,
      state: destination.state,
      targetDate: targetDate || new Date().toISOString().split("T")[0],
      attractions: attractions.map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        description: a.description
      })),
      elderlySupportRows,
      accessibilityRows,
      openingHoursRows,
      entryFeesRows,
      weatherForecast
    });
  }
}

export const accessibilityService = new AccessibilityService();
