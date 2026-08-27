import { ProvenanceSource } from "./ai";

// ---------------------------------------------------------------------------
// Phase 8D — Real-Time Adaptive Itinerary types (request-scoped reasoning only)
// ---------------------------------------------------------------------------

export type AdaptationMode = "assess_only" | "suggest_adjustments" | "apply_adjustment";

export type ChangeType =
  "weather" | "crowd" | "safety" | "routing" | "schedule" | "availability" | "user_constraint";

export type ChangeSeverity = "low" | "medium" | "high" | "critical";

export type ChangeSource = "weather" | "crowd" | "safety" | "routing" | "user" | "schedule";

/** One itinerary item in the request-scoped reasoning snapshot. */
export interface SnapshotItem {
  placeId: string;
  placeName: string;
  category?: string;
  destinationId?: string;
  destinationName?: string;
  day: number;
  timeBlock: "morning" | "afternoon" | "evening";
  entryFeeAmount?: number | null;
  openingHours?: string | null;
  isWheelchairAccessible?: boolean;
}

/** Request-scoped itinerary snapshot — NEVER persisted (no new table). */
export interface ItinerarySnapshot {
  tripId: string | null;
  generatedAt: string;
  destinations: Array<{ id: string; name: string }>;
  days: number[];
  items: SnapshotItem[];
  interCityLegs?: Array<{
    fromDestinationId: string;
    toDestinationId: string;
    status: string;
    distanceKm: number | null;
    durationMinutes: number | null;
  }>;
}

export interface DetectedChange {
  type: ChangeType;
  severity: ChangeSeverity;
  affectedDay: number | null;
  affectedDestinationId: string | null;
  affectedPlaceIds: string[];
  reason: string;
  source: ChangeSource;
}

export interface ProposedChange {
  action: "replace_item" | "reschedule_item" | "remove_item";
  day: number;
  affectedPlaceId: string;
  affectedPlaceName: string;
  replacementPlaceId?: string;
  replacementPlaceName?: string;
  newTimeBlock?: SnapshotItem["timeBlock"];
  reason: string;
  /** Change-minimization tier applied (documented deterministic order). */
  minimizationTier: 1 | 2 | 3 | 4;
  preservedConstraints: string[];
  sources: ProvenanceSource[];
}

export interface AdaptationResultDto {
  adaptationMode: AdaptationMode;
  tripId: string | null;
  changesDetected: DetectedChange[];
  proposedChanges: ProposedChange[];
  preservedItems: Array<{ day: number; placeId: string; placeName: string }>;
  updatedItinerary: Array<{
    day: number;
    destinationName?: string;
    timeBlock?: string;
    placeId: string;
    placeName: string;
  }> | null;
  warnings: string[];
  unknowns: string[];
  sources: ProvenanceSource[];
}

/**
 * DOCUMENTED DETERMINISTIC SEVERITY RULES (no invented severities):
 *
 * weather:
 *   precipitationProbabilityPercent > 60 OR precipitationMm > 5      → high
 *   precipitationProbabilityPercent 40–60                            → medium
 *   temperatureC > 38                                                → high
 *   temperatureC 35–38                                               → medium
 * crowd (7A baseline heuristic — confidence carried, never hardened):
 *   level very_high                                                  → high
 *   level high                                                       → medium
 *   verified rush-window overlap with a scheduled time block         → low
 * safety (7B verified records only):
 *   active alert present                                             → high
 *   verified serious incident within freshness window                → high
 * routing:
 *   leg unavailable                                                  → medium
 *   verified duration increase > 33% vs snapshot                     → medium
 * schedule/opening-hours:
 *   scheduled block conflicts with VERIFIED opening hours            → low
 * availability:
 *   previously selected place missing from current verified data     → medium
 * user_constraint:
 *   newly stated hard accessibility requirement                      → high
 *   explicit budget change                                           → medium
 *   interest/preference adjustments                                  → low
 */
