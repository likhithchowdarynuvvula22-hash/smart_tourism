import {
  TripRow,
  ItineraryItemRow,
  SavedPlaceRow,
  TravelPreferenceRow,
  TouristProfileRow,
  DestinationRow,
  AttractionRow
} from "./database.types";

export interface CreateTripDto {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
}

export interface UpdateTripDto {
  name?: string;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
}

export interface CreateItineraryItemDto {
  destinationId?: string | null;
  attractionId?: string | null;
  visitDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
  sortOrder?: number | null;
}

export interface UpdateItineraryItemDto {
  destinationId?: string | null;
  attractionId?: string | null;
  visitDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
  sortOrder?: number | null;
}

export interface SavePlaceDto {
  destinationId?: string | null;
  attractionId?: string | null;
}

export interface SavedPlacePopulatedDto extends SavedPlaceRow {
  destination?: DestinationRow | null;
  attraction?: AttractionRow | null;
}

export interface UpdatePreferencesDto {
  // travel_preferences
  interests?: string[] | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  preferredTripDays?: number | null;
  accessibilityNeeds?: string[] | null;
  safetyPriority?: boolean | null;

  // tourist_profiles
  travelStyle?: string | null;
  budgetRange?: string | null;
  ageGroup?: string | null;
  mobilityNeeds?: string[] | null;
  safetyPreferences?: string[] | null;
  soloTraveller?: boolean | null;
  familyGroup?: boolean | null;
  elderlyTraveller?: boolean | null;

  // users_profile (Phase 8B)
  preferredLanguage?: string | null;
}

export interface FullPreferencesDto {
  userId: string;
  travelPreferences: TravelPreferenceRow | null;
  touristProfile: TouristProfileRow | null;
  /** Phase 8B — resolved preferred language from users_profile. */
  preferredLanguage?: string | null;
}

export interface TripWithItemsDto extends TripRow {
  items: ItineraryItemRow[];
}
