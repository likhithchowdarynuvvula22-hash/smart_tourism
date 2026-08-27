/**
 * Accessibility & Elderly Travel Intelligence Type Definitions & DTOs
 * Phase 7C — Grounded, verified accessibility and senior citizen travel intelligence.
 */

export type AccessibilityStatus = "supported" | "partially_supported" | "not_supported" | "unknown";

export type ElderlySuitability =
  "suitable" | "conditionally_suitable" | "not_recommended" | "unknown";

export type AccessibilityDataQualityStatus = "sufficient" | "limited" | "insufficient";

export interface AccessibilityDataQuality {
  status: AccessibilityDataQualityStatus;
  explanation: string;
  verifiedAttractionsCount: number;
  totalAttractionsCount: number;
  evidenceAvailable: string[];
  evidenceUnavailable: string[];
}

export interface AttractionAccessibilityDto {
  attractionId: string;
  attractionName: string;
  category?: string | null;
  status: AccessibilityStatus;
  wheelchairAccess: boolean | null;
  ramps: boolean | null;
  lifts: boolean | null;
  accessibleToilet: boolean | null;
  restingAreas: boolean | null;
  walkingDifficulty: string | null;
  stepsCount: number | null;
  medicalDistanceKm: number | null;
  accessibleTransport: boolean | null;
  verifiedFacilities: string[];
  verificationStatus?: string | null;
  lastVerified?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
}

export interface AttractionElderlySupportDto {
  attractionId: string;
  attractionName: string;
  category?: string | null;
  suitability: ElderlySuitability;
  benches: boolean | null;
  ramps: boolean | null;
  lifts: boolean | null;
  accessibleToilet: boolean | null;
  stairs: string | null;
  seniorEntryFee?: number | null;
  currency?: string | null;
  openingHours?: {
    openingTime: string | null;
    closingTime: string | null;
    seasonalNotes: string | null;
  } | null;
  verifiedFacilities: string[];
  verificationStatus?: string | null;
  lastVerified?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
}

export interface DestinationAccessibilityAssessmentDto {
  destinationId: string;
  destinationName: string;
  state?: string;
  date?: string;
  accessibilityStatus: AccessibilityStatus;
  confidence: number;
  dataQuality: AccessibilityDataQuality;
  terrainAssessment: string;
  verifiedFacilities: string[];
  suitableAttractions: AttractionAccessibilityDto[];
  limitedAttractions: AttractionAccessibilityDto[];
  unknownAttractions: AttractionAccessibilityDto[];
  unsupportedAttractions: AttractionAccessibilityDto[];
  routingNotes?: string[];
  weatherNotes?: string[];
  recommendations: string[];
  warnings: string[];
  disclaimer: string;
  sources: Array<{
    type: "database" | "external";
    provider: string;
    resource: string;
  }>;
}

export interface DestinationElderlyAssessmentDto {
  destinationId: string;
  destinationName: string;
  state?: string;
  date?: string;
  suitability: ElderlySuitability;
  confidence: number;
  dataQuality: AccessibilityDataQuality;
  terrainAssessment: string;
  pacingGuidance: string;
  restingBenchesAvailability: "verified_available" | "limited" | "unknown";
  suitableAttractions: AttractionElderlySupportDto[];
  conditionallySuitableAttractions: AttractionElderlySupportDto[];
  notRecommendedAttractions: AttractionElderlySupportDto[];
  unknownAttractions: AttractionElderlySupportDto[];
  recommendations: string[];
  warnings: string[];
  disclaimer: string;
  sources: Array<{
    type: "database" | "external";
    provider: string;
    resource: string;
  }>;
}
