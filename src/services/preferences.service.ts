import { SupabaseClient } from "@supabase/supabase-js";
import { Database, TravelPreferenceInsert, TouristProfileInsert } from "../types/database.types";
import { UpdatePreferencesDto, FullPreferencesDto } from "../types/trip";
import {
  preferencesRepository,
  PreferencesRepository
} from "../repositories/preferences.repository";
import { userRepository, UserRepository } from "../repositories/user.repository";

export class PreferencesService {
  constructor(
    private readonly prefRepo: PreferencesRepository = preferencesRepository,
    private readonly usersRepo: UserRepository = userRepository
  ) {}

  /**
   * Retrieves full travel preferences and tourist profile for a user.
   */
  async getPreferences(
    userId: string,
    client?: SupabaseClient<Database>
  ): Promise<FullPreferencesDto> {
    const [travelPreferences, touristProfile] = await Promise.all([
      this.prefRepo.findTravelPreferences(userId, client),
      this.prefRepo.findTouristProfile(userId, client)
    ]);

    return {
      userId,
      travelPreferences,
      touristProfile
    };
  }

  /**
   * Updates or creates travel preferences and tourist profile for a user.
   */
  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
    client?: SupabaseClient<Database>
  ): Promise<FullPreferencesDto> {
    const travelPayload: Partial<TravelPreferenceInsert> = {};
    if (dto.interests !== undefined) travelPayload.interests = dto.interests;
    if (dto.budgetMin !== undefined) travelPayload.budget_min = dto.budgetMin;
    if (dto.budgetMax !== undefined) travelPayload.budget_max = dto.budgetMax;
    if (dto.preferredTripDays !== undefined)
      travelPayload.preferred_trip_days = dto.preferredTripDays;
    if (dto.accessibilityNeeds !== undefined)
      travelPayload.accessibility_needs = dto.accessibilityNeeds;
    if (dto.safetyPriority !== undefined) travelPayload.safety_priority = dto.safetyPriority;

    const touristPayload: Partial<TouristProfileInsert> = {};
    if (dto.travelStyle !== undefined) touristPayload.travel_style = dto.travelStyle;
    if (dto.budgetRange !== undefined) touristPayload.budget_range = dto.budgetRange;
    if (dto.ageGroup !== undefined) touristPayload.age_group = dto.ageGroup;
    if (dto.mobilityNeeds !== undefined) touristPayload.mobility_needs = dto.mobilityNeeds;
    if (dto.safetyPreferences !== undefined)
      touristPayload.safety_preferences = dto.safetyPreferences;
    if (dto.soloTraveller !== undefined) touristPayload.solo_traveller = dto.soloTraveller;
    if (dto.familyGroup !== undefined) touristPayload.family_group = dto.familyGroup;
    if (dto.elderlyTraveller !== undefined) touristPayload.elderly_traveller = dto.elderlyTraveller;

    // Phase 8B — preferred language persists to users_profile (existing column)
    let updatedLanguageProfile = null;
    if (dto.preferredLanguage !== undefined && this.usersRepo) {
      updatedLanguageProfile = await this.usersRepo.updatePreferredLanguage(
        userId,
        dto.preferredLanguage,
        client
      );
    }

    const [updatedTravel, updatedTourist] = await Promise.all([
      Object.keys(travelPayload).length > 0
        ? this.prefRepo.upsertTravelPreferences(userId, travelPayload, client)
        : this.prefRepo.findTravelPreferences(userId, client),
      Object.keys(touristPayload).length > 0
        ? this.prefRepo.upsertTouristProfile(userId, touristPayload, client)
        : this.prefRepo.findTouristProfile(userId, client)
    ]);

    return {
      userId,
      travelPreferences: updatedTravel,
      touristProfile: updatedTourist,
      preferredLanguage:
        dto.preferredLanguage !== undefined
          ? dto.preferredLanguage
          : (updatedLanguageProfile?.preferred_language ?? null)
    };
  }
}

export const preferencesService = new PreferencesService();
