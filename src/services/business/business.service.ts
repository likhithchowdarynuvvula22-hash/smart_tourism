import {
  BusinessFilterOptions,
  DestinationBusinessesDto,
  LocalBusinessItemDto
} from "../../types/business";
import {
  DestinationRepository,
  destinationRepository
} from "../../repositories/destination.repository";
import { TourismRepository, tourismRepository } from "../../repositories/tourism.repository";
import {
  PreferencesRepository,
  preferencesRepository
} from "../../repositories/preferences.repository";
import { BusinessAnalyzer, businessAnalyzer } from "./analyzers/business.analyzer";
import { isValidUuid } from "../../utils/validators";
import { BadRequestError, NotFoundError } from "../../utils/appError";
import { supabase } from "../../lib/supabase";
import { LocalBusinessRow } from "../../types/database.types";

import { requestCache } from "../../utils/requestCache";

export class BusinessService {
  constructor(
    private readonly destRepo: DestinationRepository = destinationRepository,
    private readonly tourismRepo: TourismRepository = tourismRepository,
    private readonly prefRepo: PreferencesRepository = preferencesRepository,
    private readonly analyzer: BusinessAnalyzer = businessAnalyzer
  ) {}

  /**
   * Retrieves verified local businesses and services for a destination.
   */
  async getDestinationBusinesses(
    destinationId: string,
    options: BusinessFilterOptions = {},
    userId?: string
  ): Promise<DestinationBusinessesDto> {
    if (!isValidUuid(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID: '${destinationId}'. Must be a valid UUID.`
      );
    }

    const cacheKey = !userId
      ? `biz:${destinationId}:${options.category || "all"}:${options.limit || 50}:${(options.interests || []).join(",")}`
      : undefined;

    if (cacheKey) {
      const cached = requestCache.get<DestinationBusinessesDto>(cacheKey);
      if (cached) return cached;
    }

    const destination = await this.destRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found.`);
    }

    // 1. Resolve user preference context if available
    let effectiveOptions: BusinessFilterOptions = { ...options };
    if (userId && isValidUuid(userId)) {
      const prefs = await this.prefRepo.findTravelPreferences(userId).catch(() => null);
      if (prefs) {
        effectiveOptions = {
          ...effectiveOptions,
          interests: effectiveOptions.interests || prefs.interests || [],
          isBudgetConstrained:
            effectiveOptions.isBudgetConstrained ?? (prefs.budget_max !== null ? true : false),
          isWheelchairUser:
            effectiveOptions.isWheelchairUser ?? (prefs.accessibility_needs?.length ? true : false)
        };
      }
    }

    // 2. Fetch businesses directly linked to this destination
    const limit = options.limit || 50;
    let rawBusinesses = await this.tourismRepo.findLocalBusinessesByDestinationId(
      destinationId,
      limit
    );

    // 3. If zero direct businesses, check for geographic locality match in address
    if (
      rawBusinesses.length === 0 &&
      (destination.district || destination.city || destination.name)
    ) {
      const locationTokens = [destination.name, destination.city, destination.district]
        .filter(Boolean)
        .map((t) => (t as string).trim());

      if (locationTokens.length > 0) {
        // Look up verified businesses matching city/district in address with limit
        const { data: addressMatched } = await supabase
          .from("local_businesses")
          .select("*")
          .or(locationTokens.map((t) => `address.ilike.%${t}%`).join(","))
          .limit(limit);

        if (addressMatched && addressMatched.length > 0) {
          rawBusinesses = addressMatched as LocalBusinessRow[];
        }
      }
    }

    // 4. Assess, filter, and score businesses
    const result = this.analyzer.assessBusinesses(destination, rawBusinesses, effectiveOptions);
    if (cacheKey) {
      requestCache.set(cacheKey, result, 30000);
    }
    return result;
  }

  /**
   * Retrieves single business details by UUID.
   */
  async getBusinessById(businessId: string): Promise<LocalBusinessItemDto> {
    if (!isValidUuid(businessId)) {
      throw new BadRequestError(`Invalid business ID: '${businessId}'. Must be a valid UUID.`);
    }

    const business = await this.tourismRepo.findBusinessById(businessId);
    if (!business) {
      throw new NotFoundError(`Local business with ID '${businessId}' not found.`);
    }

    let destination = null;
    if (business.destination_id && isValidUuid(business.destination_id)) {
      destination = await this.destRepo.findById(business.destination_id).catch(() => null);
    }

    return this.analyzer.normalizeBusiness(business, destination);
  }
}

export const businessService = new BusinessService();
