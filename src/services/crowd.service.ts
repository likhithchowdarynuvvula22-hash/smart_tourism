import { DestinationCrowdDto } from "../types/crowd";
import { CrowdRepository, crowdRepository } from "../repositories/crowd.repository";
import {
  DestinationRepository,
  destinationRepository
} from "../repositories/destination.repository";
import { WeatherService, weatherService } from "./external/weather/weather.service";
import { CrowdPredictor } from "./crowd/predictors/crowd.predictor";
import { baselineCrowdPredictor } from "./crowd/predictors/baseline.predictor";
import { BadRequestError, NotFoundError } from "../utils/appError";
import { isValidUuid } from "../utils/validators";
import { logger } from "../lib/logger";

export class CrowdService {
  constructor(
    private readonly crowdRepo: CrowdRepository = crowdRepository,
    private readonly destinationRepo: DestinationRepository = destinationRepository,
    private readonly weatherSvc: WeatherService = weatherService,
    private readonly predictor: CrowdPredictor = baselineCrowdPredictor
  ) {}

  /**
   * Generates a grounded crowd intelligence assessment for a specific destination and date.
   */
  async getCrowdAssessment(destinationId: string, dateStr?: string): Promise<DestinationCrowdDto> {
    if (!destinationId || !isValidUuid(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID format: '${destinationId}'. Must be a valid UUID.`
      );
    }

    // 1. Ensure Destination Exists
    const destination = await this.destinationRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found`);
    }

    // 2. Validate & Normalize Target Date
    let targetDate = dateStr;
    if (targetDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || isNaN(Date.parse(targetDate))) {
        throw new BadRequestError(`Invalid date format: '${targetDate}'. Expected YYYY-MM-DD.`);
      }
    } else {
      targetDate = new Date().toISOString().split("T")[0];
    }

    // 3. Load Available Historical Data (Destination-level & State-level)
    const [crowdObservations, demandData, visitorCounts, demandForecasts] = await Promise.all([
      this.crowdRepo.getCrowdData(destinationId),
      this.crowdRepo.getDemandData(destinationId, destination.state || undefined),
      this.crowdRepo.getVisitorCounts(destinationId, destination.state || undefined),
      this.crowdRepo.getDemandForecasts(destinationId, destination.state || undefined)
    ]);

    // 4. Fetch Weather Context (with error isolation)
    let weather = null;
    if (destination.latitude && destination.longitude) {
      try {
        const weatherDto = await this.weatherSvc.getDestinationWeather(destinationId, targetDate);
        weather = weatherDto.current;
      } catch (err) {
        logger.debug({ err, destinationId }, "External weather fetch omitted for crowd assessment");
      }
    }

    // 5. Execute Predictor Assessment
    const result = await this.predictor.assess({
      destination,
      targetDate,
      crowdObservations,
      demandData,
      visitorCounts,
      demandForecasts,
      weather
    });

    return {
      destinationId: destination.id,
      destinationName: destination.name,
      state: destination.state || undefined,
      date: targetDate,
      crowd: result.crowd,
      recommendedWindows: result.recommendedWindows,
      busyWindows: result.busyWindows,
      dataQuality: result.dataQuality,
      reasoning: result.reasoning,
      sources: result.sources
    };
  }
}

export const crowdService = new CrowdService();
