import { Database } from "../../../types/database.types";
import { CurrentWeatherDto } from "../../../types/external";
import { ProvenanceSource } from "../../../types/ai";
import { CrowdMetricsDto, TimeWindowDto, DataQualityDto } from "../../../types/crowd";

type DestinationRow = Database["public"]["Tables"]["destinations"]["Row"];
type CrowdDataRow = Database["public"]["Tables"]["crowd_data"]["Row"];
type DemandDataRow = Database["public"]["Tables"]["demand_data"]["Row"];
type VisitorCountsRow = Database["public"]["Tables"]["visitor_counts"]["Row"];
type DemandForecastsRow = Database["public"]["Tables"]["demand_forecasts"]["Row"];

export interface CrowdAssessmentContext {
  destination: DestinationRow;
  targetDate: string; // YYYY-MM-DD
  crowdObservations: CrowdDataRow[];
  demandData: DemandDataRow[];
  visitorCounts: VisitorCountsRow[];
  demandForecasts: DemandForecastsRow[];
  weather?: CurrentWeatherDto | null;
}

export interface CrowdAssessmentResult {
  crowd: CrowdMetricsDto;
  recommendedWindows: TimeWindowDto[];
  busyWindows: TimeWindowDto[];
  dataQuality: DataQualityDto;
  reasoning: string[];
  sources: ProvenanceSource[];
}

export interface CrowdPredictor {
  readonly name: string;
  assess(context: CrowdAssessmentContext): Promise<CrowdAssessmentResult>;
}
