import { ProvenanceSource } from "./ai";

export type BusinessDataQualityStatus = "sufficient" | "limited" | "insufficient";

export type BusinessCategory =
  | "homestay"
  | "hotel"
  | "restaurant"
  | "handicraft"
  | "artisan"
  | "tour_operator"
  | "guide"
  | "transport"
  | "shopping"
  | "local_service"
  | "other";

export interface LocalBusinessItemDto {
  id: string;
  businessCode: string | null;
  destinationId: string | null;
  destinationName: string | null;
  name: string;
  type: string | null;
  normalizedCategory: BusinessCategory;
  address: string | null;
  phone: string | null;
  email: string | null;
  languages: string[];
  price: string;
  openingHours: string;
  rating: string;
  accessibility: {
    wheelchairAccess: boolean | "unknown";
    notes: string[];
  };
  elderlySuitability: {
    suitable: boolean | "unknown";
    notes: string[];
  };
  verified: boolean;
  verificationStatus: string;
  matchScore: number;
  matchReason: string;
  source: ProvenanceSource;
  sourceUrl: string | null;
  createdAt: string;
}

export interface DestinationBusinessesDto {
  destinationId: string;
  destinationName: string;
  state: string;
  dataQuality: {
    status: BusinessDataQualityStatus;
    totalCount: number;
    verifiedCount: number;
    explanation: string;
  };
  businesses: LocalBusinessItemDto[];
  availableCategories: string[];
  unknowns: string[];
  disclaimer: string;
  sources: ProvenanceSource[];
}

export interface BusinessFilterOptions {
  category?: string;
  search?: string;
  verifiedOnly?: boolean;
  interests?: string[];
  avoidInterests?: string[];
  isElderlyTraveller?: boolean;
  isWheelchairUser?: boolean;
  isBudgetConstrained?: boolean;
  limit?: number;
  page?: number;
  pageSize?: number;
}
