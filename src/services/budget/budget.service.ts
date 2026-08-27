import {
  DestinationRepository,
  destinationRepository
} from "../../repositories/destination.repository";
import { TourismRepository, tourismRepository } from "../../repositories/tourism.repository";
import {
  PreferencesRepository,
  preferencesRepository
} from "../../repositories/preferences.repository";
import { BudgetAnalyzer, budgetAnalyzer } from "./analyzers/budget.analyzer";
import { supabase } from "../../lib/supabase";
import {
  AttractionFeeBreakdownDto,
  BudgetCalculationRequestDto,
  BudgetQueryOptions,
  DestinationBudgetAssessmentDto
} from "../../types/budget";
import { BadRequestError, NotFoundError } from "../../utils/appError";
import { validateUUID } from "../../utils/validators";
import { logger } from "../../lib/logger";

export class BudgetService {
  constructor(
    private readonly destRepo: DestinationRepository = destinationRepository,
    private readonly tourismRepo: TourismRepository = tourismRepository,
    private readonly prefRepo: PreferencesRepository = preferencesRepository,
    private readonly analyzer: BudgetAnalyzer = budgetAnalyzer
  ) {}

  /**
   * Retrieves budget and cost assessment for a specific destination.
   */
  async getDestinationBudget(
    destinationId: string,
    options: BudgetQueryOptions = {},
    userId?: string
  ): Promise<DestinationBudgetAssessmentDto> {
    if (!destinationId || !validateUUID(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID: '${destinationId}'. Must be a valid UUID.`
      );
    }

    const destination = await this.destRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found.`);
    }

    const mergedOptions: BudgetQueryOptions = { ...options };

    // If authenticated user has preferences and no explicit budget was provided in options, use preference
    if (userId && mergedOptions.userBudget === undefined) {
      try {
        const userPrefs = await this.prefRepo.findTravelPreferences(userId);
        if (userPrefs?.budget_max) {
          mergedOptions.userBudget = userPrefs.budget_max;
        } else if (userPrefs?.budget_min) {
          mergedOptions.userBudget = userPrefs.budget_min;
        }
      } catch (err) {
        logger.warn(
          { userId, err },
          "Failed to fetch user travel preferences for budget calculation; continuing with defaults"
        );
      }
    }

    const attractions = await this.tourismRepo.findAttractionsByDestinationId(destinationId);
    const entryFees = await this.tourismRepo.findEntryFeesByDestinationId(destinationId);

    return this.analyzer.assessDestinationBudget(
      destination,
      attractions,
      entryFees,
      mergedOptions
    );
  }

  /**
   * Retrieves attraction-level entry fee catalog for a destination.
   */
  async getAttractionFees(destinationId: string): Promise<AttractionFeeBreakdownDto[]> {
    if (!destinationId || !validateUUID(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID: '${destinationId}'. Must be a valid UUID.`
      );
    }

    const destination = await this.destRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found.`);
    }

    const attractions = await this.tourismRepo.findAttractionsByDestinationId(destinationId);
    const entryFees = await this.tourismRepo.findEntryFeesByDestinationId(destinationId);

    const assessment = this.analyzer.assessDestinationBudget(destination, attractions, entryFees);
    return assessment.breakdown.attractionFees;
  }

  /**
   * Calculates custom budget across specified attractions or a destination.
   */
  async calculateCustomBudget(
    dto: BudgetCalculationRequestDto,
    userId?: string
  ): Promise<DestinationBudgetAssessmentDto> {
    if (dto.destinationId) {
      return this.getDestinationBudget(dto.destinationId, dto, userId);
    }

    if (!dto.attractionIds || dto.attractionIds.length === 0) {
      throw new BadRequestError(
        "Either destinationId or attractionIds must be provided for budget calculation."
      );
    }

    for (const attrId of dto.attractionIds) {
      if (!validateUUID(attrId)) {
        throw new BadRequestError(`Invalid attraction ID: '${attrId}'. Must be a valid UUID.`);
      }
    }

    // Fallback virtual destination for multi-place custom calculation
    const virtualDestination = {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Custom Itinerary Selection",
      state: "India",
      city: null,
      district: null,
      description: null,
      destination_code: null,
      best_time_to_visit: null,
      rush_free_hours: null,
      latitude: null,
      longitude: null,
      source: null,
      source_url: null,
      verification_status: null,
      last_verified: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Gather attractions and fees
    // In our tourism repository, let's fetch for each or query
    const attractions = [];
    const entryFees = [];

    // Query each attraction
    for (const attrId of dto.attractionIds) {
      const { data: attr } = await supabase
        .from("attractions")
        .select("*")
        .eq("id", attrId)
        .maybeSingle();

      if (attr) {
        attractions.push(attr);
        const { data: fee } = await supabase
          .from("entry_fees")
          .select("*")
          .eq("attraction_id", attrId)
          .maybeSingle();

        if (fee) {
          entryFees.push(fee);
        }
      }
    }

    return this.analyzer.assessDestinationBudget(virtualDestination, attractions, entryFees, dto);
  }
}

export const budgetService = new BudgetService();
