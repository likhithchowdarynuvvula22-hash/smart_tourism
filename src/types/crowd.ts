import { ProvenanceSource } from "./ai";

export type CrowdLevel = "low" | "moderate" | "high" | "very_high" | "unknown";
export type ForecastConfidence = "high" | "medium" | "low" | "unavailable";
export type DataQualityStatus = "sufficient" | "limited" | "insufficient";

export interface TimeWindowDto {
  startTime: string;
  endTime: string;
  label: string;
  description: string;
}

export interface CrowdMetricsDto {
  level: CrowdLevel;
  /**
   * Deterministic rule-based heuristic index (0-100).
   * NOTE: This is a prototype heuristic baseline, NOT a measured visitor count or ML prediction.
   */
  baselineIndex: number | null;
  unit: "baseline_crowd_index_0_100" | null;
  confidence: ForecastConfidence;
}

export interface DataQualityDto {
  status: DataQualityStatus;
  historicalObservations: number;
  sourceCount: number;
}

export interface DestinationCrowdDto {
  destinationId: string;
  destinationName: string;
  state?: string;
  date: string;
  crowd: CrowdMetricsDto;
  recommendedWindows: TimeWindowDto[];
  busyWindows: TimeWindowDto[];
  dataQuality: DataQualityDto;
  reasoning: string[];
  sources: ProvenanceSource[];
}
