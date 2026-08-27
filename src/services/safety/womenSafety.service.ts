import { DestinationWomenSafetyDto } from "../../types/safety";
import { SafetyRepository, safetyRepository } from "../../repositories/safety.repository";
import { TourismRepository, tourismRepository } from "../../repositories/tourism.repository";
import {
  DestinationRepository,
  destinationRepository
} from "../../repositories/destination.repository";
import { WomenSafetyAnalyzer, womenSafetyAnalyzer } from "./analyzers/womenSafety.analyzer";
import { BadRequestError, NotFoundError } from "../../utils/appError";
import { isValidUuid } from "../../utils/validators";

export class WomenSafetyService {
  constructor(
    private readonly safeRepo: SafetyRepository = safetyRepository,
    private readonly tourRepo: TourismRepository = tourismRepository,
    private readonly destinationRepo: DestinationRepository = destinationRepository,
    private readonly analyzer: WomenSafetyAnalyzer = womenSafetyAnalyzer
  ) {}

  /**
   * Generates a grounded women safety assessment for a destination and optional date.
   */
  async getWomenSafetyAssessment(
    destinationId: string,
    dateStr?: string
  ): Promise<DestinationWomenSafetyDto> {
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

    // 3. Fetch Safety & Emergency Data in Parallel
    const [womenSafetyRow, indicators, alerts, incidents, emergencyResources] = await Promise.all([
      this.safeRepo.findWomenSafetyByDestinationId(destinationId),
      this.safeRepo.findSafetyIndicatorsByDestinationId(destinationId),
      this.safeRepo.findSafetyAlertsByDestinationId(destinationId),
      this.safeRepo.findSafetyIncidentsByDestinationId(destinationId),
      this.tourRepo.findEmergencyResourcesByDestinationId(destinationId)
    ]);

    // 4. Execute Grounded Safety Assessment via Analyzer
    return this.analyzer.assess({
      destinationId: destination.id,
      destinationName: destination.name,
      state: destination.state || undefined,
      targetDate,
      womenSafetyRow,
      indicators,
      alerts,
      incidents,
      emergencyResources
    });
  }
}

export const womenSafetyService = new WomenSafetyService();
