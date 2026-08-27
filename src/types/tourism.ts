import {
  DestinationRow,
  OpeningHoursRow,
  EntryFeesRow,
  AccessibilityRow,
  ElderlySupportRow,
  LanguageRow,
  SafetyIndicatorRow,
  SafetyAlertRow,
  SafetyIncidentRow,
  WomenSafetyRow
} from "./database.types";

export type { OpeningHoursRow, EntryFeesRow, AccessibilityRow, ElderlySupportRow };

export interface DestinationFilterOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  state?: string;
  district?: string;
  sortBy?: "name" | "state" | "created_at";
  sortOrder?: "asc" | "desc";
}

export interface DestinationSafetyDto {
  destinationId: string;
  destinationName: string;
  state: string;
  indicators: SafetyIndicatorRow[];
  alerts: SafetyAlertRow[];
  incidents: SafetyIncidentRow[];
  womenSafety: WomenSafetyRow | null;
}

export interface DestinationDetailDto extends DestinationRow {
  languageInfo?: LanguageRow | null;
  womenSafetyInfo?: WomenSafetyRow | null;
}
