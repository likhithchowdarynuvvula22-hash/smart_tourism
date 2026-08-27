import { ProvenanceSource } from "./ai";

export type ExperienceCategory =
  | "culture"
  | "heritage"
  | "history"
  | "food"
  | "nature"
  | "adventure"
  | "spiritual"
  | "shopping"
  | "family"
  | "photography"
  | "relaxation"
  | "wellness"
  | "leisure"
  | "other";

export type ExperienceDataQualityStatus = "sufficient" | "limited" | "insufficient";

export interface ExperienceItemDto {
  id: string;
  name: string;
  itemType: "experience" | "attraction" | "local_business";
  category: string;
  normalizedCategories: string[];
  description: string | null;
  matchScore: number;
  matchReason: string;
  verified: boolean;
  accessibility: {
    supported: boolean;
    wheelchairAccess: boolean;
    details: string | null;
  };
  elderlySuitability: {
    suitable: boolean;
    note: string | null;
  };
  knownCost: {
    amount: number | null;
    currency: string;
    isFree: boolean;
    pricingType: string;
  } | null;
  crowdContext: {
    rushFreeHours: string | null;
    bestTime: string | null;
  } | null;
  languagesSpoken: string[];
  source: string | null;
  sourceUrl: string | null;
  verificationStatus: string | null;
}

export interface ExperienceQueryOptions {
  interests?: string[];
  avoidInterests?: string[];
  includeAttractions?: boolean;
  includeBusinesses?: boolean;
  isElderlyTraveller?: boolean;
  isWheelchairUser?: boolean;
  isBudgetConstrained?: boolean;
  isSoloFemale?: boolean;
  limit?: number;
}

export interface DestinationExperienceAssessmentDto {
  destinationId: string;
  destinationName: string;
  state: string;
  interests: string[];
  avoidInterests: string[];
  dataQuality: {
    status: ExperienceDataQualityStatus;
    experienceCount: number;
    attractionCount: number;
    businessCount: number;
    explanation: string;
  };
  languages: {
    official: string | null;
    local: string | null;
    guide: string | null;
    source: string | null;
  } | null;
  rankedItems: ExperienceItemDto[];
  unknowns: string[];
  warnings: string[];
  disclaimer: string;
  sources: ProvenanceSource[];
}
