import {
  DestinationRepository,
  destinationRepository
} from "../../repositories/destination.repository";
import { TourismRepository, tourismRepository } from "../../repositories/tourism.repository";
import {
  PreferencesRepository,
  preferencesRepository
} from "../../repositories/preferences.repository";
import { ExperienceAnalyzer, experienceAnalyzer } from "./analyzers/experience.analyzer";
import { supabase } from "../../lib/supabase";
import {
  DestinationExperienceAssessmentDto,
  ExperienceCategory,
  ExperienceItemDto,
  ExperienceQueryOptions
} from "../../types/experience";
import { BadRequestError, NotFoundError } from "../../utils/appError";
import { isValidUuid } from "../../utils/validators";
import { logger } from "../../lib/logger";

export class ExperienceService {
  constructor(
    private readonly destRepo: DestinationRepository = destinationRepository,
    private readonly tourismRepo: TourismRepository = tourismRepository,
    private readonly prefRepo: PreferencesRepository = preferencesRepository,
    private readonly analyzer: ExperienceAnalyzer = experienceAnalyzer
  ) {}

  /**
   * Retrieves and deterministically assesses cultural and local experiences for a destination.
   */
  async getDestinationExperiences(
    destinationId: string,
    options: ExperienceQueryOptions = {},
    userId?: string
  ): Promise<DestinationExperienceAssessmentDto> {
    if (!destinationId || !isValidUuid(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID: '${destinationId}'. Must be a valid UUID.`
      );
    }

    const destination = await this.destRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found.`);
    }

    // Merge authenticated user travel preferences if interests not explicitly provided in query
    const mergedOptions = { ...options };
    if (userId) {
      try {
        const userPrefs = await this.prefRepo.findTravelPreferences(userId);
        if (userPrefs) {
          if (
            (!mergedOptions.interests || mergedOptions.interests.length === 0) &&
            userPrefs.interests
          ) {
            mergedOptions.interests = userPrefs.interests;
          }
          if (userPrefs.accessibility_needs && userPrefs.accessibility_needs.length > 0) {
            if (userPrefs.accessibility_needs.some((a) => /wheelchair|ramp|elevator/i.test(a))) {
              mergedOptions.isWheelchairUser = true;
            }
            if (
              userPrefs.accessibility_needs.some((a) =>
                /senior|elderly|less.walking|benches/i.test(a)
              )
            ) {
              mergedOptions.isElderlyTraveller = true;
            }
          }
          if (
            userPrefs.budget_max !== null &&
            userPrefs.budget_max !== undefined &&
            userPrefs.budget_max <= 2000
          ) {
            mergedOptions.isBudgetConstrained = true;
          }
        }
      } catch (prefErr) {
        logger.warn(
          { prefErr, userId },
          "Failed to fetch user travel preferences; proceeding with defaults"
        );
      }
    }

    // Concurrent fetch of all verified relational data for this destination
    const [experiences, attractions, businesses, languages, accessibilityRows, elderlyRows] =
      await Promise.all([
        this.tourismRepo.findExperiencesByDestinationId(destinationId),
        this.tourismRepo.findAttractionsByDestinationId(destinationId),
        this.tourismRepo.findLocalBusinessesByDestinationId(destinationId),
        this.tourismRepo.findLanguagesByDestinationId(destinationId),
        this.tourismRepo.findAccessibilityByDestinationId(destinationId),
        this.tourismRepo.findElderlySupportByDestinationId(destinationId)
      ]);

    // Build accessibility mapping
    const accessibilityMap = new Map<
      string,
      { wheelchair: boolean; elderly: boolean; details?: string }
    >();
    for (const acc of accessibilityRows) {
      accessibilityMap.set(acc.attraction_id, {
        wheelchair: acc.wheelchair_access ?? false,
        elderly: false,
        details: acc.walking_difficulty
          ? `Walking difficulty: ${acc.walking_difficulty}`
          : undefined
      });
    }
    for (const eld of elderlyRows) {
      const existing = accessibilityMap.get(eld.attraction_id) || {
        wheelchair: false,
        elderly: false
      };
      existing.elderly = eld.benches === true || eld.stairs === "None (Level Paved Ground)";
      accessibilityMap.set(eld.attraction_id, existing);
    }

    // Fetch entry fees for attractions in this destination
    const feesMap = new Map<
      string,
      { amount: number | null; isFree: boolean; pricingType: string }
    >();
    if (attractions.length > 0) {
      const attractionIds = attractions.map((a) => a.id);
      const { data: fees } = await supabase
        .from("entry_fees")
        .select("*")
        .in("attraction_id", attractionIds);

      if (fees) {
        for (const fee of fees) {
          const amount = fee.fee_domestic !== null ? Number(fee.fee_domestic) : null;
          feesMap.set(fee.attraction_id, {
            amount,
            isFree: amount === 0,
            pricingType: amount !== null ? "verified_domestic_entry_fee" : "unknown"
          });
        }
      }
    }

    const languageRow = languages;

    return this.analyzer.assessDestinationExperiences(
      destination,
      experiences,
      attractions,
      businesses,
      languageRow,
      mergedOptions,
      accessibilityMap,
      feesMap
    );
  }

  /**
   * Returns list of supported categories and ontology mappings.
   */
  getCategories(): {
    supportedCategories: ExperienceCategory[];
    description: string;
  } {
    return {
      supportedCategories: [
        "culture",
        "heritage",
        "history",
        "food",
        "nature",
        "adventure",
        "spiritual",
        "shopping",
        "family",
        "photography",
        "relaxation",
        "wellness",
        "leisure",
        "other"
      ],
      description:
        "Deterministic experience ontology mapping cultural, heritage, nature, spiritual, and regional tourism categories."
    };
  }

  /**
   * Custom candidate ranking endpoint logic.
   */
  rankCustomCandidates(
    items: ExperienceItemDto[],
    options: ExperienceQueryOptions = {}
  ): ExperienceItemDto[] {
    return this.analyzer.scoreAndRankCandidates(items, options);
  }
}

export const experienceService = new ExperienceService();
