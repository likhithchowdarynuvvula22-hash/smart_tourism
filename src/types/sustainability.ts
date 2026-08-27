import { ProvenanceSource } from "./ai";

// ---------------------------------------------------------------------------
// Data Quality
// ---------------------------------------------------------------------------

export type SustainabilityDataQualityStatus = "sufficient" | "limited" | "insufficient";

/**
 * Sustainability status values.
 * NOTE: "unfavorable" is intentionally excluded — the database contains zero
 * verified evidence of environmental degradation. Marking any destination
 * unfavorable without verified evidence would be fabrication.
 */
export type SustainabilityStatus = "favorable" | "mixed" | "unknown";

// ---------------------------------------------------------------------------
// Verified Attribute DTO
// ---------------------------------------------------------------------------

export type SustainabilityAttributeType =
  | "eco_experience" // Experience name contains explicit eco/community keyword
  | "community_experience" // Village, tribal, community-oriented experience
  | "nature_attraction" // Attraction category includes wildlife / natural / lake
  | "community_accommodation" // Verified homestay (community accommodation option)
  | "railway_access" // Railway connectivity — lower-emission travel option
  | "walking_access"; // Attraction with verified walking difficulty (not extreme)

export interface VerifiedSustainabilityAttributeDto {
  type: SustainabilityAttributeType;
  label: string;
  description: string;
  entityId: string;
  entityName: string;
  entityType: "experience" | "attraction" | "business" | "transport";
  verified: boolean;
  verificationStatus: string;
  source: ProvenanceSource;
  sourceUrl: string | null;
  /**
   * IMPORTANT: This attribute is NOT an eco-certification.
   * It is a verified database signal that indicates community/nature orientation,
   * not a sustainability guarantee.
   */
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Carbon Assessment DTO
// ---------------------------------------------------------------------------

/**
 * Carbon assessment is always "unavailable" in Phase 7H.
 * The database has no emission factors, no verified transport mode data,
 * and no fuel consumption records. Any distance × factor calculation
 * would be fabrication.
 */
export interface CarbonAssessmentDto {
  status: "available" | "unavailable";
  value: number | null;
  unit: string | null;
  methodology: string | null;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Transport Context DTO
// ---------------------------------------------------------------------------

export interface TransportContextDto {
  destinationId: string;
  nearestRailway: string | null;
  railwayDistanceKm: number | null;
  nearestAirport: string | null;
  airportDistanceKm: number | null;
  highwayAccess: string | null;
  railwayNote: string | null; // Qualitative note if railway access is reasonable
  source: ProvenanceSource;
}

// ---------------------------------------------------------------------------
// Low-Impact Option DTO
// ---------------------------------------------------------------------------

export interface LowImpactOptionDto {
  type: "railway_travel" | "walking" | "community_stay" | "local_experience" | "off_peak_timing";
  label: string;
  description: string;
  basis: string; // What verified evidence supports this option
  caveat: string; // What this does NOT claim
}

// ---------------------------------------------------------------------------
// Main Response DTO
// ---------------------------------------------------------------------------

export interface SustainabilityDataQuality {
  status: SustainabilityDataQualityStatus;
  evidenceCount: number;
  ecoExperienceCount: number;
  communityExperienceCount: number;
  natureAttractionCount: number;
  communityAccommodationCount: number;
  transportContextAvailable: boolean;
  explanation: string;
}

export interface DestinationSustainabilityDto {
  destinationId: string;
  destinationName: string;
  state: string;
  /**
   * Sustainability status based on verified evidence only.
   * "unknown" for the majority of destinations (insufficient evidence).
   */
  sustainabilityStatus: SustainabilityStatus;
  /**
   * Confidence is null unless we have >= 2 independent verified signals.
   */
  confidence: number | null;
  dataQuality: SustainabilityDataQuality;
  /**
   * Verified sustainability-relevant attributes from the database.
   * Each carries a disclaimer that it is NOT an eco-certification.
   */
  verifiedAttributes: VerifiedSustainabilityAttributeDto[];
  /**
   * Community and eco-oriented experience options (verified by name/category).
   * NOT automatically "environmentally sustainable" — surfaced as orientation only.
   */
  communityOptions: VerifiedSustainabilityAttributeDto[];
  /**
   * Lower-impact travel options based on verified routing/transport data.
   * Described as "lower travel burden" not "lower carbon emissions."
   */
  lowImpactOptions: LowImpactOptionDto[];
  /**
   * Known transport connectivity context (distances only — no emission calculations).
   */
  knownTransportContext: TransportContextDto | null;
  /**
   * Carbon assessment — always "unavailable" in Phase 7H.
   */
  carbonAssessment: CarbonAssessmentDto;
  /**
   * Rush-free hours reused from Phase 7A for lower-congestion timing.
   */
  rushFreeHours: string | null;
  recommendations: string[];
  unknowns: string[];
  warnings: string[];
  disclaimer: string;
  sources: ProvenanceSource[];
}

// ---------------------------------------------------------------------------
// Filter Options
// ---------------------------------------------------------------------------

export interface SustainabilityFilterOptions {
  preferCommunity?: boolean;
  preferEcoExperiences?: boolean;
  minimizeTravel?: boolean;
  isWheelchairUser?: boolean;
  isElderlyTraveller?: boolean;
  isSoloFemale?: boolean;
}
