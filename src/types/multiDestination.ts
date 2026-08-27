import { ItineraryDayDto, ProvenanceSource } from "./ai";

// ---------------------------------------------------------------------------
// Phase 8C — Multi-Destination Itinerary Orchestration DTOs
// ---------------------------------------------------------------------------

export type PlanningScopeType = "state" | "district" | "multi_destination";

export interface SelectedDestinationDto {
  id: string;
  name: string;
  district: string | null;
  state: string;
  /** Transparent deterministic reason this destination was selected. */
  selectionReason: string;
  /** Honest per-destination data-quality disclosure. */
  dataQuality: {
    verifiedAttractions: number;
    verifiedExperiences: number;
    status: "sufficient" | "limited" | "insufficient";
    explanation: string;
  };
}

export interface InterCityLegDto {
  fromDestinationId: string;
  toDestinationId: string;
  fromName: string;
  toName: string;
  status: "available" | "unavailable";
  distanceKm: number | null;
  durationMinutes: number | null;
  unavailableReason?: string;
  provider?: string;
}

export interface DestinationDayAllocation {
  destinationId: string;
  destinationName: string;
  dayNumbers: number[];
  scheduledItemCount: number;
}

/** Day tagged with its destination for multi-destination plans. */
export interface PlannedDayDto extends ItineraryDayDto {
  destinationId: string;
  destinationName: string;
}

export interface CrossDestinationInsights {
  weather: Array<{
    destinationId: string;
    destinationName: string;
    summary: string;
    available: boolean;
  }>;
  crowd: Array<{
    destinationId: string;
    destinationName: string;
    level: string | null;
    confidence: string | null;
    dataQuality: string | null;
  }>;
  womenSafety: Array<{
    destinationId: string;
    destinationName: string;
    riskLevel: string | null;
    dataQuality: string | null;
  }>;
  accessibility: Array<{
    destinationId: string;
    destinationName: string;
    accessibilityStatus: string | null;
    elderlySuitability: string | null;
  }>;
  budget: {
    currency: string;
    perDestinationKnownSubtotals: Array<{
      destinationId: string;
      name: string;
      knownSubtotal: number;
    }>;
    knownTripSubtotal: number;
    unknownCategories: string[];
    budgetStatus: string;
    userBudget: number | null;
    disclaimer: string;
  };
  sustainability: Array<{
    destinationId: string;
    destinationName: string;
    sustainabilityStatus: string | null;
    carbonAssessment: string;
  }>;
}

export interface MultiDestinationPlanDto {
  planningScope: {
    type: PlanningScopeType;
    name: string;
  };
  /**
   * confirmed   — caller-supplied selectedDestinationIds were validated & used
   * automatic   — deterministic bounded auto-shortlist applied
   * awaiting_confirmation — shortlist returned; user must select destinations
   */
  mode: "confirmed" | "automatic" | "awaiting_confirmation";
  /** Full bounded candidate list always disclosed for transparency. */
  candidateShortlist: Array<{ id: string; name: string; district: string | null; state: string }>;
  selectedDestinations: SelectedDestinationDto[];
  interCityTravel: InterCityLegDto[];
  knownTravelBurden: {
    totalKnownDistanceKm: number | null;
    totalKnownDurationMinutes: number | null;
    routingCallsUsed: number;
    routingCallLimit: number;
    note: string;
  };
  dayAllocation: DestinationDayAllocation[];
  days: PlannedDayDto[];
  crossDestinationInsights: CrossDestinationInsights;
  warnings: string[];
  sources: ProvenanceSource[];
}
