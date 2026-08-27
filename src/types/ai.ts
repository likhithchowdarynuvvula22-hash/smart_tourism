import { CurrentWeatherDto } from "./external";
import { DestinationCrowdDto } from "./crowd";
import { DestinationWomenSafetyDto } from "./safety";
import {
  DestinationAccessibilityAssessmentDto,
  DestinationElderlyAssessmentDto
} from "./accessibility";
import { DestinationBudgetAssessmentDto } from "./budget";
import { DestinationExperienceAssessmentDto } from "./experience";
import {
  DestinationGalleryDto,
  MultilingualContentDto,
  DestinationContentSummaryDto
} from "./content";
import { DestinationBusinessesDto } from "./business";
import { DestinationSustainabilityDto } from "./sustainability";
import { SafeTravellerContextSummary, LocationResolution } from "./travellerContext";
import { MultiDestinationPlanDto } from "./multiDestination";
import type { AdaptationResultDto } from "./adaptive";

export type TourismIntent =
  | "destination_information"
  | "destination_search"
  | "trip_planning"
  | "itinerary_help"
  | "crowd_query"
  | "safety_query"
  | "weather_query"
  | "route_query"
  | "accessibility_query"
  | "elderly_travel_query"
  | "budget_query"
  | "experience_query"
  | "content_query"
  | "women_safety_query"
  | "translation_query"
  | "local_business_query"
  | "sustainability_query"
  | "general_tourism_query";

export type ToolName =
  | "destination_search"
  | "destination_details"
  | "attractions"
  | "experiences"
  | "accessibility"
  | "elderly_support"
  | "accessibility_intelligence"
  | "elderly_travel_intelligence"
  | "budget_intelligence"
  | "experience_intelligence"
  | "content_intelligence"
  | "local_business_intelligence"
  | "crowd_intelligence"
  | "safety"
  | "emergency_resources"
  | "women_safety_intelligence"
  | "local_businesses"
  | "weather"
  | "geocoding"
  | "routing"
  | "translation"
  | "sustainability_intelligence"
  | "user_preferences"
  | "user_trips"
  | "user_saved_places";

export interface ExtractedEntities {
  destinationName?: string;
  destinationId?: string;
  days?: number;
  startDate?: string;
  travellerGroup?: "solo" | "family" | "parents" | "elderly" | "couple" | "group";
  interests?: string[];
  avoidInterests?: string[];
  budget?: string;
  userBudget?: number;
  budgetCurrency?: string;
  isBudgetConstrained?: boolean;
  isStudentTraveller?: boolean;
  isForeignTraveller?: boolean;
  adultsCount?: number;
  seniorsCount?: number;
  childrenCount?: number;
  studentsCount?: number;
  foreignAdultsCount?: number;
  accessibilityNeeds?: string[];
  targetLanguage?: string;
  contentTopic?: string;
  businessCategory?: string;
  businessSearchTerm?: string;
  ecoFriendlyPreference?: boolean;
  communityPreference?: boolean;
  minimizeTravel?: boolean;
  originLocation?: string;
  originCoords?: { latitude: number; longitude: number };
  destinationCoords?: { latitude: number; longitude: number };
  avoidCrowds?: boolean;
  isWomenTraveller?: boolean;
  isSoloFemale?: boolean;
  isElderlyTraveller?: boolean;
  requiresWheelchair?: boolean;
  reducedMobility?: boolean;
}

export interface IntentClassificationResult {
  intent: TourismIntent;
  confidence: number;
  entities: ExtractedEntities;
  requiredTools: ToolName[];
}

export interface ProvenanceSource {
  type: "database" | "external";
  provider: string;
  resource: string;
}

export interface EntryFeeInfo {
  amount: number;
  currency: string;
  category?: string;
  note?: string;
}

export interface CandidatePlace {
  id: string;
  name: string;
  type: "attraction" | "experience" | "business" | "destination_fallback";
  category?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  isElderlyFriendly?: boolean;
  isWheelchairAccessible?: boolean;
  /**
   * Phase 8A — verified accessibility status.
   * "unknown" is never coerced to accessible/inaccessible.
   */
  accessibilityStatus?: "accessible" | "unknown" | "inaccessible";
  accessibilityNotes: string[];
  elderlyNotes: string[];
  openingHours?: string | null;
  entryFee?: EntryFeeInfo | null;
}

export interface ItineraryItemDto {
  sequence: number;
  timeBlock: "morning" | "afternoon" | "evening";
  placeId: string;
  placeName: string;
  reason: string;
  estimatedVisitMinutes?: number | null;
  travelFromPreviousMinutes?: number | null;
  travelFromPreviousKm?: number | null;
  weatherConsideration?: string | null;
  accessibilityNotes: string[];
  elderlyNotes: string[];
  entryFee?: EntryFeeInfo | null;
  openingHours?: string | null;
}

export interface ItineraryDayDto {
  day: number;
  date?: string;
  theme?: string;
  items: ItineraryItemDto[];
}

export interface TripDetailsDto {
  destination: string;
  destinationId?: string;
  durationDays: number;
  travellerGroup?: string;
  startDate?: string;
}

export interface RecommendationDto {
  title: string;
  description: string;
  category?: string;
  highlights?: string[];
}

export interface SafetySummaryDto {
  overview?: string;
  safetyScore?: number;
  womenHelpline?: string;
  emergencyHelplines?: Record<string, string>;
  alerts?: string[];
}

export interface AccessibilitySummaryDto {
  wheelchairSupport?: boolean;
  elderlySupport?: boolean;
  notes?: string[];
}

export interface OrchestratorResponseDto {
  intent: TourismIntent;
  summary: string;
  trip?: TripDetailsDto;
  destination?: {
    id?: string;
    name?: string;
    state?: string;
    description?: string;
  };
  recommendations: RecommendationDto[];
  itinerary?: ItineraryDayDto[];
  days?: ItineraryDayDto[];
  crowd?: DestinationCrowdDto | null;
  weather?: CurrentWeatherDto | null;
  safety?: SafetySummaryDto | null;
  womenSafety?: DestinationWomenSafetyDto | null;
  accessibility?: AccessibilitySummaryDto | null;
  accessibilityAssessment?: DestinationAccessibilityAssessmentDto | null;
  elderlyAssessment?: DestinationElderlyAssessmentDto | null;
  budgetAssessment?: DestinationBudgetAssessmentDto | null;
  experienceAssessment?: DestinationExperienceAssessmentDto | null;
  gallery?: DestinationGalleryDto | null;
  multilingualContent?: MultilingualContentDto | null;
  contentSummary?: DestinationContentSummaryDto | null;
  businesses?: DestinationBusinessesDto | null;
  sustainability?: DestinationSustainabilityDto | null;
  warnings: string[];
  sources: ProvenanceSource[];
  /** Phase 8A — sanitized unified traveller context summary (no private data). */
  travellerContext?: SafeTravellerContextSummary | null;
  /** Phase 8B — deterministic state/district/destination resolution outcome. */
  locationResolution?: LocationResolution | null;
  /** Phase 8C — grounded multi-destination plan (state/district/explicit). */
  multiDestinationPlan?: MultiDestinationPlanDto | null;
  /** Phase 8D — real-time adaptive itinerary assessment/proposals. */
  adaptation?: AdaptationResultDto | null;
  /** Phase 8E — deterministic cross-gap validation & conflict evaluation. */
  crossGapValidation?: import("./crossGapValidator").CrossGapValidationResultDto | null;
}
