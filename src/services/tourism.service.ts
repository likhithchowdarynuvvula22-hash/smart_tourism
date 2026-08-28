import {
  destinationRepository,
  DestinationRepository
} from "../repositories/destination.repository";
import { reviewsRepository, DestinationReviewRow } from "../repositories/reviews.repository";
import { tourismRepository, TourismRepository } from "../repositories/tourism.repository";
import { safetyRepository, SafetyRepository } from "../repositories/safety.repository";
import {
  DestinationRow,
  AttractionRow,
  ExperienceRow,
  OpeningHoursRow,
  EntryFeesRow,
  AccessibilityRow,
  ElderlySupportRow,
  ImageRow,
  LanguageRow,
  EmergencyResourceRow,
  LocalBusinessRow
} from "../types/database.types";
import {
  DestinationFilterOptions,
  DestinationSafetyDto,
  DestinationDetailDto
} from "../types/tourism";
import { PaginationMeta } from "../types/api";
import { isValidUuid, parsePagination } from "../utils/validators";
import { BadRequestError, NotFoundError } from "../utils/appError";
import { logger } from "../lib/logger";

export interface PaginatedDestinationsResult {
  destinations: (DestinationRow & { image_url?: string | null })[];
  pagination: PaginationMeta;
}

export class TourismService {
  constructor(
    private readonly destRepo: DestinationRepository = destinationRepository,
    private readonly tourRepo: TourismRepository = tourismRepository,
    private readonly safeRepo: SafetyRepository = safetyRepository
  ) {}

  /**
   * Helper to validate destination UUID and ensure the destination exists.
   */
  private async ensureDestinationExists(id: string): Promise<DestinationRow> {
    if (!isValidUuid(id)) {
      throw new BadRequestError(`Invalid destination ID format: '${id}'. Must be a valid UUID.`);
    }

    const destination = await this.destRepo.findById(id);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${id}' not found`);
    }

    return destination;
  }

  /**
   * Retrieves a paginated and filtered list of destinations.
   */
  async getDestinations(
    options: DestinationFilterOptions & Record<string, unknown> = {}
  ): Promise<PaginatedDestinationsResult> {
    const { page, pageSize, offset, limit } = parsePagination(options, 50, 1000);

    const [destinations, total] = await Promise.all([
      this.destRepo.findMany({
        ...options,
        offset,
        limit
      }),
      this.destRepo.count(options)
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    const pagination: PaginationMeta = {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    };

    logger.debug(
      { count: destinations.length, total, page, pageSize },
      "Retrieved paginated destinations"
    );

    return {
      destinations,
      pagination
    };
  }

  /**
   * Retrieves all unique states and the count of destinations in each state.
   */
  async getStates(): Promise<{ state: string; count: number }[]> {
    return this.destRepo.getStates();
  }

  /**
   * Retrieves a single destination with associated language and women safety info.
   */
  async getDestinationById(id: string): Promise<DestinationDetailDto> {
    const destination = await this.ensureDestinationExists(id);

    const [languageInfo, womenSafetyInfo] = await Promise.all([
      this.tourRepo.findLanguagesByDestinationId(id).catch(() => null),
      this.safeRepo.findWomenSafetyByDestinationId(id).catch(() => null)
    ]);

    return {
      ...destination,
      languageInfo,
      womenSafetyInfo
    };
  }

  /**
   * Retrieves attractions associated with a destination.
   */
  async getAttractions(destinationId: string): Promise<AttractionRow[]> {
    await this.ensureDestinationExists(destinationId);
    return this.tourRepo.findAttractionsByDestinationId(destinationId);
  }

  /**
   * Retrieves experiences associated with a destination.
   */
  async getExperiences(destinationId: string): Promise<ExperienceRow[]> {
    await this.ensureDestinationExists(destinationId);
    return this.tourRepo.findExperiencesByDestinationId(destinationId);
  }

  /**
   * Retrieves opening hours for attractions in a destination.
   */
  async getOpeningHours(destinationId: string): Promise<OpeningHoursRow[]> {
    await this.ensureDestinationExists(destinationId);
    return this.tourRepo.findOpeningHoursByDestinationId(destinationId);
  }

  /**
   * Retrieves entry fees for attractions in a destination.
   */
  async getEntryFees(destinationId: string): Promise<EntryFeesRow[]> {
    await this.ensureDestinationExists(destinationId);
    return this.tourRepo.findEntryFeesByDestinationId(destinationId);
  }

  /**
   * Retrieves accessibility features for attractions in a destination.
   */
  async getAccessibility(destinationId: string): Promise<AccessibilityRow[]> {
    await this.ensureDestinationExists(destinationId);
    return this.tourRepo.findAccessibilityByDestinationId(destinationId);
  }

  /**
   * Retrieves elderly support amenities for attractions in a destination.
   */
  async getElderlySupport(destinationId: string): Promise<ElderlySupportRow[]> {
    await this.ensureDestinationExists(destinationId);
    return this.tourRepo.findElderlySupportByDestinationId(destinationId);
  }

  /**
   * Retrieves images for a destination.
   */
  async getImages(destinationId: string): Promise<ImageRow[]> {
    await this.ensureDestinationExists(destinationId);
    return this.tourRepo.findImagesByDestinationId(destinationId);
  }

  /**
   * Retrieves languages spoken in a destination.
   */
  async getLanguages(destinationId: string): Promise<LanguageRow | null> {
    await this.ensureDestinationExists(destinationId);
    return this.tourRepo.findLanguagesByDestinationId(destinationId);
  }

  /**
   * Retrieves an aggregated safety overview for a destination.
   */
  async getSafety(destinationId: string): Promise<DestinationSafetyDto> {
    const destination = await this.ensureDestinationExists(destinationId);

    const [indicators, alerts, incidents, womenSafety] = await Promise.all([
      this.safeRepo.findSafetyIndicatorsByDestinationId(destinationId),
      this.safeRepo.findSafetyAlertsByDestinationId(destinationId),
      this.safeRepo.findSafetyIncidentsByDestinationId(destinationId),
      this.safeRepo.findWomenSafetyByDestinationId(destinationId)
    ]);

    return {
      destinationId: destination.id,
      destinationName: destination.name,
      state: destination.state,
      indicators,
      alerts,
      incidents,
      womenSafety
    };
  }

  /**
   * Retrieves emergency contacts and resources for a destination.
   */
  async getEmergencyResources(destinationId: string): Promise<EmergencyResourceRow[]> {
    await this.ensureDestinationExists(destinationId);
    return this.tourRepo.findEmergencyResourcesByDestinationId(destinationId);
  }

  /**
   * Retrieves local businesses in a destination.
   */
  async getLocalBusinesses(destinationId: string, limit?: number): Promise<LocalBusinessRow[]> {
    await this.ensureDestinationExists(destinationId);
    return this.tourRepo.findLocalBusinessesByDestinationId(destinationId, limit || 20);
  }

  /**
   * Retrieves reviews for a destination, falling back to mock ones if none exist.
   */
  async getReviews(destinationId: string): Promise<DestinationReviewRow[]> {
    await this.ensureDestinationExists(destinationId);
    const dbReviews = await reviewsRepository.findByDestinationId(destinationId);
    if (dbReviews.length > 0) {
      return dbReviews;
    }
    
    // Fallback static data if database has no reviews yet
    return [
      {
        id: "default-1",
        destination_id: destinationId,
        user_name: "Aarav Patel",
        rating: 5,
        comment: "An incredible place to visit. The local food is amazing, and the people welcoming. Very clean and well-maintained.",
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: "default-2",
        destination_id: destinationId,
        user_name: "Priya Nair",
        rating: 4,
        comment: "Beautiful scenery and great cultural experience. Facilities were decent, though restroom accessibility could be slightly improved. Recommended!",
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
  }

  /**
   * Creates a new review for a destination.
   */
  async createReview(destinationId: string, userName: string, rating: number, comment: string): Promise<DestinationReviewRow> {
    await this.ensureDestinationExists(destinationId);
    
    if (!userName || userName.trim().length === 0) {
      throw new BadRequestError("User name is required");
    }
    if (rating < 1 || rating > 5) {
      throw new BadRequestError("Rating must be between 1 and 5");
    }
    if (!comment || comment.trim().length === 0) {
      throw new BadRequestError("Comment is required");
    }

    return reviewsRepository.create(destinationId, userName, rating, comment);
  }
}

export const tourismService = new TourismService();
