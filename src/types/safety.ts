import {
  SafetyIndicatorRow,
  SafetyAlertRow,
  SafetyIncidentRow,
  WomenSafetyRow,
  EmergencyResourceRow
} from "./database.types";
import { ProvenanceSource } from "./ai";

export type WomenSafetyRiskLevel = "low" | "moderate" | "elevated" | "unknown";
export type DataQualityStatus = "sufficient" | "limited" | "insufficient";
export type IncidentFreshness = "recent" | "historical" | "stale";

export interface WomenSafetyDataQuality {
  status: DataQualityStatus;
  explanation: string;
  evidenceAvailable: string[];
  evidenceUnavailable: string[];
}

export interface SourceBackedSafetyScore {
  score: number;
  confidence: number;
  explanation?: string | null;
  indicatorType: string;
  source: string;
  validFrom?: string;
  validTo?: string | null;
}

export interface WomenSafetyIndicatorsDto {
  helpline: string | null;
  womenPolice: string | null;
  supportCenter: string | null;
  medicalFacility: string | null;
  verificationStatus: string | null;
  lastVerified: string | null;
  source: string | null;
  sourceUrl: string | null;
}

export interface WomenSpecificEmergencyResource {
  name: string;
  type: string;
  phone: string | null;
  address?: string | null;
  openingHours?: string | null;
  verified: boolean;
}

export interface WomenEmergencyResourcesSummary {
  nationalEmergency: string;
  police: string;
  ambulance: string;
  womenHelpline: string;
  touristSupport: string;
  womenSpecificResources: WomenSpecificEmergencyResource[];
  totalAvailable: number;
}

export interface NormalizedSafetyAlert {
  id: string;
  title: string;
  severity: string;
  message: string;
  startsAt: string;
  endsAt: string | null;
  status: string | null;
  isCurrent: boolean;
}

export interface NormalizedSafetyIncident {
  id: string;
  category: string;
  severity: string | null;
  description: string | null;
  incidentDate: string | null;
  status: string | null;
  verificationStatus: string | null;
  freshness: IncidentFreshness;
}

export interface DestinationWomenSafetyDto {
  destinationId: string;
  destinationName: string;
  state?: string;
  date?: string;
  riskLevel: WomenSafetyRiskLevel;
  confidence: number;
  dataQuality: WomenSafetyDataQuality;
  sourceBackedScore: SourceBackedSafetyScore | null;
  womenSafetyIndicators: WomenSafetyIndicatorsDto;
  emergencyResources: WomenEmergencyResourcesSummary;
  alerts: NormalizedSafetyAlert[];
  incidents: NormalizedSafetyIncident[];
  recommendations: string[];
  warnings: string[];
  disclaimer: string;
  sources: ProvenanceSource[];
}

export interface SafetyAnalysisInput {
  destinationId: string;
  destinationName: string;
  state?: string;
  targetDate: string;
  womenSafetyRow: WomenSafetyRow | null;
  indicators: SafetyIndicatorRow[];
  alerts: SafetyAlertRow[];
  incidents: SafetyIncidentRow[];
  emergencyResources: EmergencyResourceRow[];
}
