import {
  DestinationSustainabilityDto,
  SustainabilityFilterOptions
} from "../../types/sustainability";
import {
  DestinationRepository,
  destinationRepository
} from "../../repositories/destination.repository";
import { TourismRepository, tourismRepository } from "../../repositories/tourism.repository";
import {
  SustainabilityAnalyzer,
  sustainabilityAnalyzer
} from "./analyzers/sustainability.analyzer";
import { isValidUuid } from "../../utils/validators";
import { BadRequestError, NotFoundError } from "../../utils/appError";

export class SustainabilityService {
  constructor(
    private readonly destRepo: DestinationRepository = destinationRepository,
    private readonly tourismRepo: TourismRepository = tourismRepository,
    private readonly analyzer: SustainabilityAnalyzer = sustainabilityAnalyzer
  ) {}

  /**
   * Retrieves a grounded sustainability assessment for a destination.
   * All signals are sourced strictly from verified database records.
   * No carbon calculations are performed. No eco-certifications are invented.
   */
  async getDestinationSustainability(
    destinationId: string,
    options: SustainabilityFilterOptions = {}
  ): Promise<DestinationSustainabilityDto> {
    if (!isValidUuid(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID format: '${destinationId}'. Must be a valid UUID.`
      );
    }

    const destination = await this.destRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found.`);
    }

    // Fetch all sustainability-relevant data in parallel (no N+1)
    const [experiences, attractions, businesses, transportRow] = await Promise.all([
      this.tourismRepo.findExperiencesByDestinationId(destinationId),
      this.tourismRepo.findAttractionsByDestinationId(destinationId),
      this.tourismRepo.findLocalBusinessesByDestinationId(destinationId),
      this.tourismRepo.findTransportConnectivityByDestinationId(destinationId)
    ]);

    // Fetch accessibility records for discovered attractions (avoids N+1)
    const attractionIds = attractions.map((a) => a.id);
    const accessibilityRecords =
      attractionIds.length > 0
        ? await this.tourismRepo.findAccessibilityByAttractionIds(attractionIds)
        : [];

    return this.analyzer.assess(
      {
        id: destination.id,
        name: destination.name,
        state: destination.state,
        rush_free_hours: destination.rush_free_hours
      },
      experiences,
      attractions,
      businesses,
      accessibilityRecords,
      transportRow,
      options
    );
  }
}

export const sustainabilityService = new SustainabilityService();
