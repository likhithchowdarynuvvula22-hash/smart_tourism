/**
 * PHASE 8A — Unified Traveller Context & Constraint Engine
 *
 * Architectural separation enforced by these types:
 *   1. CONTEXT      — facts/preferences about the traveller (with provenance)
 *   2. CONSTRAINTS  — rules that must be respected (hard) or optimized (soft/objective)
 *   3. OBJECTIVES   — optimization goals
 *   4. UNKNOWN      — information that is not available (never coerced to false/zero/safe)
 *
 * Every normalized field carries a SourcedValue so downstream modules can
 * distinguish explicit / stored / derived / unknown provenance.
 */

// ---------------------------------------------------------------------------
// Provenance primitives
// ---------------------------------------------------------------------------

/**
 * Semantic source labels. Database table names are intentionally abstracted
 * away — raw internals are never exposed to users or external AI providers.
 */
export type ContextSource =
  | "authenticated_identity" // validated auth context (never client-supplied)
  | "stored_profile" // tourist_profiles / users_profile persisted facts
  | "stored_preference" // travel_preferences persisted facts
  | "trip_context" // existing saved trip record
  | "explicit_request" // stated in the current request/message
  | "derived" // deterministically inferred from other verified facts
  | "unknown"; // not available anywhere

/**
 * Semantic confidence labels only. No fabricated numeric confidences.
 */
export type ContextConfidence = "verified" | "high" | "medium" | "low" | "unknown";

export interface SourcedValue<T> {
  value: T;
  source: ContextSource;
  confidence: ContextConfidence;
}

const UNKNOWN = (): SourcedValue<null> => ({
  value: null,
  source: "unknown",
  confidence: "unknown"
});

export const sourcedUnknown = UNKNOWN;

// ---------------------------------------------------------------------------
// Normalized Traveller Context
// ---------------------------------------------------------------------------

export interface TravellerIdentity {
  authenticated: boolean;
  userId: string | null;
  role: string | null;
}

export interface TravellerTripContext {
  destinationId: SourcedValue<string | null>;
  destinationName: SourcedValue<string | null>;
  tripId: SourcedValue<string | null>;
  travelDates: {
    start: SourcedValue<string | null>;
    end: SourcedValue<string | null>;
  };
  durationDays: SourcedValue<number | null>;
  travellerCount: SourcedValue<number | null>;
}

export interface TravellerProfileContext {
  travellerGroup: SourcedValue<string | null>;
  ageContext: SourcedValue<string | null>;
  interests: SourcedValue<string[]>;
  avoidInterests: SourcedValue<string[]>;
  preferredLanguage: SourcedValue<string | null>;
  accessibilityNeeds: SourcedValue<string[]>;
  mobilityNeeds: SourcedValue<string[]>;
  travelStyle: SourcedValue<string | null>;
}

export interface TravellerBudgetContext {
  amount: SourcedValue<number | null>;
  currency: SourcedValue<string | null>;
  /** "hard_limit" only when explicitly specified in the current request. */
  priority: SourcedValue<"hard_limit" | "soft_guide" | null>;
}

export interface TravellerPreferenceFlags {
  avoidCrowds: SourcedValue<boolean | null>;
  preferEco: SourcedValue<boolean | null>;
  communityPreference: SourcedValue<boolean | null>;
  minimizeTravel: SourcedValue<boolean | null>;
}

export interface TravellerSafetyContext {
  womenSafetyRelevant: SourcedValue<boolean>;
  soloFemale: SourcedValue<boolean>;
}

/**
 * Phase 8B — persisted trip context loaded ONLY for trip-relevant requests.
 * Ownership is always verified upstream via the existing TripService.
 */
export interface ActiveTripSummary {
  tripId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  itineraryItemCount: number;
  /** Names of the user's own saved places (bounded, advisory only). */
  savedPlaceNames?: string[];
}

export interface TravellerContentPreferences {
  targetLanguage: SourcedValue<string | null>;
}

export interface TravellerContext {
  identity: TravellerIdentity;
  tripContext: TravellerTripContext;
  /** Persisted trip loaded for trip-relevant requests (null = no trip loaded). */
  activeTrip: ActiveTripSummary | null;
  travellerProfile: TravellerProfileContext;
  budget: TravellerBudgetContext;
  preferences: TravellerPreferenceFlags;
  safetyContext: TravellerSafetyContext;
  contentPreferences: TravellerContentPreferences;
  /** Field names successfully resolved from verified sources. */
  knownUserData: string[];
  /** Field names looked for but not available — preserved as unknown, never defaulted. */
  unknownUserData: string[];
}

// ---------------------------------------------------------------------------
// Constraint model
// ---------------------------------------------------------------------------

export type ConstraintStrength = "hard" | "soft" | "objective";

export type ConstraintCategory =
  | "safety"
  | "accessibility"
  | "explicit_prohibition"
  | "feasibility"
  | "physical"
  | "budget"
  | "interest"
  | "crowd"
  | "sustainability"
  | "optimization";

/**
 * Deterministic constraint priority ordering (lower = higher precedence).
 * Eco-friendly or cheap optimizations can NEVER outrank safety,
 * accessibility, or explicit user requirements.
 */
export const CONSTRAINT_PRIORITY_ORDER: readonly ConstraintCategory[] = [
  "safety", // 1
  "accessibility", // 2
  "explicit_prohibition", // 3
  "feasibility", // 4
  "physical", // 5
  "budget", // 6
  "interest", // 7
  "crowd", // 8
  "sustainability", // 9
  "optimization" // 10
];

export interface Constraint {
  id: string;
  category: ConstraintCategory;
  strength: ConstraintStrength;
  description: string;
  source: ContextSource;
  /** Numeric rank derived deterministically from CONSTRAINT_PRIORITY_ORDER. */
  priority: number;
}

export interface ResolvedConflict {
  betweenCategories: [ConstraintCategory, ConstraintCategory];
  winnerCategory: ConstraintCategory;
  rationale: string;
}

export interface ConstraintResolution {
  constraints: Constraint[];
  hardConstraints: Constraint[];
  softPreferences: Constraint[];
  objectives: Constraint[];
  conflicts: ResolvedConflict[];
}

// ---------------------------------------------------------------------------
// LLM-safe projection (security boundary)
// ---------------------------------------------------------------------------

/**
 * Minimal sanitized context shared with AI providers.
 * Excludes: emails, phone numbers, auth metadata, internal ids beyond
 * destination scope, and anything unrelated to the active request.
 */
export interface SafeTravellerContextSummary {
  authenticated: boolean;
  travellerGroup: string | null;
  accessibilityRequirements: string[];
  mobilityNeeds: string[];
  interests: string[];
  avoidInterests: string[];
  budgetAmount: number | null;
  budgetPriority: "hard_limit" | "soft_guide" | null;
  avoidCrowds: boolean | null;
  preferEco: boolean | null;
  communityPreference: boolean | null;
  minimizeTravel: boolean | null;
  womenSafetyRelevant: boolean;
  soloFemale: boolean;
  targetLanguage: string | null;
  durationDays: number | null;
  activeTrip: {
    name: string;
    startDate: string | null;
    endDate: string | null;
    durationDays: number | null;
    itineraryItemCount: number;
  } | null;
  unknownFields: string[];
  activeHardConstraints: string[];
  activeSoftPreferences: string[];
  objectives: string[];
  conflictNotes: string[];
}

// ---------------------------------------------------------------------------
// Phase 8B — Context Preview DTO (user-facing transparency layer)
// ---------------------------------------------------------------------------

export interface ContextPreviewDto {
  identity: {
    authenticated: boolean;
    role: string | null;
  };
  storedPreferences: {
    language: string | null;
    interests: string[];
    accessibilityNeeds: string[];
    budget: { min: number | null; max: number | null };
    preferredTripDays: number | null;
    travelStyle: string | null;
  };
  travellerContext: SafeTravellerContextSummary;
  constraints: {
    hard: string[];
    soft: string[];
    objectives: string[];
  };
  unknowns: string[];
}

// ---------------------------------------------------------------------------
// Phase 8B — Location Resolution (state / district / destination)
// ---------------------------------------------------------------------------

export type LocationType = "destination" | "district" | "state" | "ambiguous" | "unknown";

export interface LocationCandidate {
  id: string;
  name: string;
  district: string | null;
  state: string;
}

export interface LocationResolution {
  locationType: LocationType;
  query: string;
  resolvedState: string | null;
  resolvedDistrict: string | null;
  candidateDestinations: LocationCandidate[];
  totalCandidates: number;
  confidence: "high" | "medium" | "low" | "unknown";
  warnings: string[];
}
