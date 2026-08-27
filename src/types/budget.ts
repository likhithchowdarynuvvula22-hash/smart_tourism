export type CostCategoryStatus = "verified" | "estimated" | "unknown";

export type BudgetStatus = "under_budget" | "near_budget" | "over_budget" | "unknown";

export type BudgetDataQualityStatus = "sufficient" | "limited" | "insufficient";

export interface BudgetDataQuality {
  status: BudgetDataQualityStatus;
  explanation: string;
  verifiedAttractionsCount: number;
  totalAttractionsCount: number;
  evidenceAvailable: string[];
  evidenceUnavailable: string[];
}

export interface TravellerCountDto {
  adults: number;
  seniors?: number;
  children?: number;
  students?: number;
  foreignAdults?: number;
}

export interface AttractionFeeBreakdownDto {
  attractionId: string;
  attractionName: string;
  category?: string;
  perPersonFee: number | null;
  totalFee: number | null;
  feeTypeApplied: "domestic" | "senior" | "child" | "student" | "foreign" | "free" | "unknown";
  isFree: boolean;
  onlineBookingAvailable: boolean;
  ticketUrl: string | null;
  verified: boolean;
  source: string | null;
  sourceUrl: string | null;
  verificationStatus: string | null;
  feeDetails: {
    domestic: number | null;
    foreign: number | null;
    child: number | null;
    student: number | null;
    senior: number | null;
    currency: string;
  };
}

export interface VerifiedSavingDto {
  attractionId: string;
  attractionName: string;
  description: string;
  concessionType: "senior" | "student" | "child" | "free_entry";
  standardFee: number;
  concessionFee: number;
  savingPerPerson: number;
  totalSavings: number;
  currency: string;
}

export interface CostCategorySummaryDto {
  category: "attractionFees" | "accommodation" | "food" | "transport" | "otherKnownCosts";
  amount: number | null;
  status: CostCategoryStatus;
  notes?: string;
}

export interface BudgetSummaryDto {
  userBudget: number | null;
  currency: string;
  knownSubtotal: number;
  remainingBudget: number | null;
  status: BudgetStatus;
  dataQuality: BudgetDataQuality;
  unknownCategories: Array<"accommodation" | "food" | "transport" | "otherCosts">;
  travellerCount: number;
  travellerBreakdown: TravellerCountDto;
  durationDays: number;
}

export interface DestinationBudgetAssessmentDto {
  destinationId: string;
  destinationName: string;
  state?: string;
  currency: string;
  budget: BudgetSummaryDto;
  breakdown: {
    attractionFees: AttractionFeeBreakdownDto[];
    accommodation: CostCategorySummaryDto;
    food: CostCategorySummaryDto;
    transport: CostCategorySummaryDto;
    otherKnownCosts: CostCategorySummaryDto[];
  };
  savings: VerifiedSavingDto[];
  recommendations: string[];
  warnings: string[];
  disclaimer: string;
  sources: Array<{
    type: "database" | "external";
    provider: string;
    resource: string;
  }>;
}

export interface BudgetQueryOptions {
  userBudget?: number;
  currency?: string;
  adults?: number;
  seniors?: number;
  children?: number;
  students?: number;
  foreignAdults?: number;
  durationDays?: number;
}

export interface BudgetCalculationRequestDto {
  destinationId?: string;
  attractionIds?: string[];
  userBudget?: number;
  currency?: string;
  adults?: number;
  seniors?: number;
  children?: number;
  students?: number;
  foreignAdults?: number;
  durationDays?: number;
}
