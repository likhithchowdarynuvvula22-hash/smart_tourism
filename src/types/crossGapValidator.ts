import { ProvenanceSource } from "./ai";

/**
 * PHASE 8E — Cross-Gap Validation & Conflict Engine
 *
 * Enforces strict deterministic validation against:
 * 1. Security & Ownership
 * 2. Destination & Place Validity (no hallucinated IDs / non-existent entities)
 * 3. Safety (Phase 7B alerts, incidents, emergency facilities)
 * 4. Accessibility (Phase 7C wheelchair, elevators, ramps)
 * 5. Explicit Exclusions (avoid-interests)
 * 6. Feasibility & Opening Hours
 * 7. Hard Budget (Phase 7D known mandatory costs)
 * 8. Physical & Elderly Constraints (resting benches, high walking difficulty)
 * 9. Multi-Destination Coherence (Phase 8C no cross-destination status transfer)
 * 10. Soft Preferences & Objectives (Crowd 7A, Experience 7E, Business 7G, Sustainability 7H, Weather, Routing)
 */

export type ConflictCategory =
  | "security"
  | "destination"
  | "place"
  | "safety"
  | "accessibility"
  | "explicit_prohibition"
  | "feasibility"
  | "opening_hours"
  | "budget"
  | "physical"
  | "crowd"
  | "sustainability"
  | "interest"
  | "business"
  | "weather"
  | "routing"
  | "multi_destination";

export type ConflictSeverity = "critical" | "high" | "medium" | "low" | "info";

export type ResolutionAction = "REJECT" | "MODIFY" | "WARN" | "ACCEPT";

export type ValidationStatus = "valid" | "conditional" | "invalid";

/**
 * Stable, machine-readable conflict codes.
 */
export type ConflictCode =
  // Security & Identity
  | "SECURITY_OWNERSHIP_VIOLATION"
  | "SECURITY_UNAUTHORIZED_ACCESS"
  // Destination & Place Validity
  | "DESTINATION_CONTEXT_MISMATCH"
  | "INVALID_DESTINATION_ID"
  | "DUPLICATE_DESTINATION"
  | "INVALID_PLACE_ID"
  | "DUPLICATE_PLACE"
  | "PLACE_NOT_IN_DESTINATION"
  // Safety
  | "SAFETY_CRITICAL_ALERT"
  | "SAFETY_INCIDENT_WARNING"
  | "SAFETY_DATA_LIMITED"
  | "WOMEN_SAFETY_CONFLICT"
  | "CROSS_DESTINATION_SAFETY_LEAK"
  // Accessibility & Elderly
  | "WHEELCHAIR_ACCESS_UNSUPPORTED"
  | "WHEELCHAIR_ACCESS_UNKNOWN"
  | "ELDERLY_BARRIER_CONFLICT"
  | "ELDERLY_DATA_UNKNOWN"
  // Prohibitions & Interests
  | "EXPLICIT_INTEREST_EXCLUDED"
  | "POSITIVE_INTEREST_MISMATCH"
  // Feasibility & Schedule
  | "OPENING_HOURS_CONFLICT"
  | "OPENING_HOURS_UNKNOWN"
  | "SCHEDULE_TIMING_IMPOSSIBLE"
  // Budget
  | "BUDGET_KNOWN_COST_EXCEEDED"
  | "BUDGET_INCOMPLETE_DATA"
  | "BUDGET_UNKNOWN_CATEGORIES"
  // Crowd
  | "CROWD_HIGH_CONFIDENCE_CONFLICT"
  | "CROWD_LOW_CONFIDENCE_WARNING"
  // Sustainability
  | "SUSTAINABILITY_UNKNOWN"
  | "CARBON_UNAVAILABLE"
  | "SUSTAINABILITY_PREFERENCE_MISMATCH"
  // Business
  | "BUSINESS_ACCESSIBILITY_UNKNOWN"
  | "BUSINESS_PRICE_UNKNOWN"
  | "BUSINESS_UNVERIFIED"
  | "BUSINESS_FABRICATED_CLAIM"
  // Weather
  | "WEATHER_SCHEDULE_CONFLICT"
  | "WEATHER_UNAVAILABLE"
  // Routing
  | "ROUTE_UNAVAILABLE"
  | "ROUTE_EXCESSIVE_BURDEN"
  | "TRAVEL_DURATION_INFEASIBLE";

export interface CrossGapConflict {
  code: ConflictCode;
  category: ConflictCategory;
  severity: ConflictSeverity;
  action: ResolutionAction;
  affectedDay?: number;
  destinationId?: string;
  destinationName?: string;
  placeId?: string;
  placeName?: string;
  message: string;
  userFacingExplanation: string;
  source?: ProvenanceSource | string;
}

export interface BlockedItem {
  placeId: string;
  placeName: string;
  destinationId?: string;
  reason: string;
  code: ConflictCode;
}

export interface ModifiedItem {
  placeId: string;
  placeName: string;
  modificationType:
    "time_adjusted" | "sequence_changed" | "activity_replaced" | "destination_swapped";
  description: string;
  previousValue?: string;
  newValue?: string;
}

export interface ResolvedItem {
  category: ConflictCategory;
  code: ConflictCode;
  action: ResolutionAction;
  summary: string;
}

export interface CrossGapValidationResultDto {
  valid: boolean;
  status: ValidationStatus;
  summary: string;
  conflicts: CrossGapConflict[];
  blockedItems: BlockedItem[];
  modifiedItems: ModifiedItem[];
  warnings: string[];
  resolutions: ResolvedItem[];
  unknowns: string[];
}
