import { CrowdPredictor, CrowdAssessmentContext, CrowdAssessmentResult } from "./crowd.predictor";
import {
  CrowdLevel,
  ForecastConfidence,
  DataQualityStatus,
  TimeWindowDto
} from "../../../types/crowd";
import { ProvenanceSource } from "../../../types/ai";

/**
 * BaselineCrowdPredictor
 *
 * NOTE ON METHODOLOGY & LIMITATIONS:
 * The current calculation is a deterministic domain heuristic designed for data-sparse environments.
 * It is NOT an AI/ML predictive model and has not been trained on historical sensor footfall datasets.
 *
 * PROTOTYPE DOMAIN HEURISTIC WEIGHTS:
 * - Base starting score: 40 (moderate default)
 * - Weekend footfall adjustment: +20
 * - Peak season adjustment (best_time_to_visit): +15
 * - Off-peak / shoulder season adjustment: -10
 * - High precipitation (>60% prob / >4mm): -20
 * - Extreme temperature (>38°C): -15
 *
 * RULE-BASED PROTOTYPE THRESHOLDS:
 * - 0–35: "low"
 * - 36–65: "moderate"
 * - 66–85: "high"
 * - 86–100: "very_high"
 *
 * These initial domain heuristics and thresholds should be recalibrated when sufficient
 * destination-level historical footfall observations become available in the database.
 */
export class BaselineCrowdPredictor implements CrowdPredictor {
  readonly name = "Baseline Deterministic Heuristic Crowd Assessor";

  /**
   * Assesses crowd levels and identifies optimal visiting windows using deterministic domain heuristics.
   * Transparently reports data insufficiency when historical observations are lacking.
   */
  async assess(context: CrowdAssessmentContext): Promise<CrowdAssessmentResult> {
    const {
      destination,
      targetDate,
      crowdObservations,
      demandData,
      visitorCounts,
      demandForecasts,
      weather
    } = context;

    const sources: ProvenanceSource[] = [
      { type: "database", provider: "Supabase", resource: "destinations" }
    ];

    // 1. Data Sufficiency Assessment
    const destCrowdCount = crowdObservations.length;
    const destDemandCount = demandData.filter((d) => d.destination_id === destination.id).length;
    const destVisitorCount = visitorCounts.filter(
      (v) => v.destination_id === destination.id
    ).length;
    const destSpecificObservations = destCrowdCount + destDemandCount + destVisitorCount;
    const totalObservations = destCrowdCount + demandData.length + visitorCounts.length;

    let dataQualityStatus: DataQualityStatus = "insufficient";
    if (destSpecificObservations >= 12) {
      dataQualityStatus = "sufficient";
    } else if (destSpecificObservations > 0 || totalObservations > 0) {
      dataQualityStatus = "limited";
    }

    if (crowdObservations.length > 0) {
      sources.push({ type: "database", provider: "Supabase", resource: "crowd_data" });
    }
    if (demandData.length > 0) {
      sources.push({ type: "database", provider: "Supabase", resource: "demand_data" });
    }
    if (visitorCounts.length > 0) {
      sources.push({ type: "database", provider: "Supabase", resource: "visitor_counts" });
    }
    if (demandForecasts.length > 0) {
      sources.push({ type: "database", provider: "Supabase", resource: "demand_forecasts" });
    }
    if (weather) {
      sources.push({ type: "external", provider: "Open-Meteo", resource: "weather_forecast" });
    }

    const reasoning: string[] = [];

    // 2. Parse Date & Temporal Features
    const parsedDate = new Date(targetDate);
    const isValidDate = !isNaN(parsedDate.getTime());
    const dayOfWeek = isValidDate ? parsedDate.getUTCDay() : 1; // 0 = Sun, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const targetMonth = isValidDate ? parsedDate.getUTCMonth() + 1 : 1; // 1-12

    let baseScore = 40; // Default baseline moderate
    let hasGroundingSignals = false;

    // Temporal Factor: Weekend vs Weekday Heuristic
    if (isWeekend) {
      baseScore += 20;
      reasoning.push(
        "The baseline applies a weekend-pattern heuristic (+20); destination-specific historical crowd observations are unavailable."
      );
      hasGroundingSignals = true;
    } else {
      reasoning.push(
        "The baseline applies a weekday/weekly-pattern heuristic; destination-specific historical crowd observations are unavailable."
      );
    }

    // Seasonal Factor: best_time_to_visit Heuristic
    if (destination.best_time_to_visit) {
      const isPeak = this.isMonthInSeason(targetMonth, destination.best_time_to_visit);
      if (isPeak) {
        baseScore += 15;
        reasoning.push(
          `The baseline applies a seasonal heuristic: target date falls within peak season (${destination.best_time_to_visit}) for ${destination.name}.`
        );
        hasGroundingSignals = true;
      } else {
        baseScore -= 10;
        reasoning.push(
          `The baseline applies a seasonal heuristic: target date is in the off-peak/shoulder season relative to recommended season (${destination.best_time_to_visit}).`
        );
        hasGroundingSignals = true;
      }
    }

    // Weather Impact Heuristic
    if (weather) {
      if (
        (weather.precipitationProbabilityPercent !== undefined &&
          weather.precipitationProbabilityPercent > 60) ||
        (weather.precipitationMm !== null &&
          weather.precipitationMm !== undefined &&
          weather.precipitationMm > 4)
      ) {
        baseScore -= 20;
        reasoning.push(
          `Weather heuristic applied: forecast indicates high rain probability (${weather.precipitationProbabilityPercent ?? 0}%), which typically suppresses outdoor footfall.`
        );
        hasGroundingSignals = true;
      } else if (weather.temperatureC > 38) {
        baseScore -= 15;
        reasoning.push(
          `Weather heuristic applied: forecast indicates high temperature (${weather.temperatureC}°C); midday outdoor footfall will likely decrease.`
        );
        hasGroundingSignals = true;
      }
    }

    // Historical Observations Factor (when data exists)
    if (crowdObservations.length > 0) {
      const avgObservedScore =
        crowdObservations.reduce((acc, c) => acc + (c.crowd_score ?? 50), 0) /
        crowdObservations.length;
      baseScore = Math.round((baseScore + avgObservedScore) / 2);
      reasoning.push(
        `Incorporated ${crowdObservations.length} historical crowd observation(s) from catalog.`
      );
      hasGroundingSignals = true;
    } else if (dataQualityStatus === "insufficient") {
      reasoning.push(
        "No direct historical crowd observations exist in database for this destination; baseline assessment derived from seasonal and temporal heuristics."
      );
    }

    // 3. Recommended & Busy Time Windows (from rush_free_hours or domain baseline)
    const { recommendedWindows, busyWindows } = this.extractVisitingWindows(
      destination.rush_free_hours
    );

    // 4. Determine Crowd Level & Confidence
    let crowdLevel: CrowdLevel = "unknown";
    let confidence: ForecastConfidence = "unavailable";

    if (dataQualityStatus === "sufficient") {
      confidence = "high";
    } else if (dataQualityStatus === "limited" || hasGroundingSignals) {
      confidence = dataQualityStatus === "limited" ? "medium" : "low";
    } else {
      confidence = "unavailable";
    }

    if (
      !hasGroundingSignals &&
      dataQualityStatus === "insufficient" &&
      !destination.rush_free_hours
    ) {
      crowdLevel = "unknown";
      confidence = "unavailable";
      reasoning.push(
        "Insufficient historical and metadata signals to formulate a reliable baseline crowd assessment."
      );
    } else {
      const clampedScore = Math.max(0, Math.min(100, baseScore));
      if (clampedScore <= 35) crowdLevel = "low";
      else if (clampedScore <= 65) crowdLevel = "moderate";
      else if (clampedScore <= 85) crowdLevel = "high";
      else crowdLevel = "very_high";
    }

    return {
      crowd: {
        level: crowdLevel,
        baselineIndex: crowdLevel !== "unknown" ? Math.max(0, Math.min(100, baseScore)) : null,
        unit: crowdLevel !== "unknown" ? "baseline_crowd_index_0_100" : null,
        confidence
      },
      recommendedWindows,
      busyWindows,
      dataQuality: {
        status: dataQualityStatus,
        historicalObservations: destSpecificObservations,
        sourceCount: sources.length
      },
      reasoning,
      sources
    };
  }

  /**
   * Checks if target month is within destination's best_time_to_visit range (e.g. "Oct-Mar", "November to February").
   */
  private isMonthInSeason(month: number, seasonStr: string): boolean {
    const s = seasonStr.toLowerCase();
    const monthsMap: Record<string, number> = {
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12
    };

    // Range patterns: "Oct-Mar", "Oct - Mar", "October to March"
    const match = s.match(/([a-z]{3,9})\s*(?:-|to)\s*([a-z]{3,9})/);
    if (match) {
      const start = monthsMap[match[1]];
      const end = monthsMap[match[2]];
      if (start && end) {
        if (start <= end) {
          return month >= start && month <= end;
        } else {
          // Wrapped across year boundary (e.g. Oct to Mar -> 10, 11, 12, 1, 2, 3)
          return month >= start || month <= end;
        }
      }
    }

    return false;
  }

  /**
   * Extracts recommended and busy time windows from rush_free_hours metadata or defaults.
   */
  private extractVisitingWindows(rushFreeHoursStr: string | null): {
    recommendedWindows: TimeWindowDto[];
    busyWindows: TimeWindowDto[];
  } {
    const recommendedWindows: TimeWindowDto[] = [];
    const busyWindows: TimeWindowDto[] = [];

    if (rushFreeHoursStr) {
      // Example: "Rush: 09:00-14:00 Free: 14:00-17:00"
      const rushMatch = rushFreeHoursStr.match(/rush:\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
      const freeMatch = rushFreeHoursStr.match(/free:\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);

      if (rushMatch) {
        busyWindows.push({
          startTime: rushMatch[1],
          endTime: rushMatch[2],
          label: "Peak Rush Window",
          description: "Peak rush window from destination metadata."
        });
      }

      if (freeMatch) {
        recommendedWindows.push({
          startTime: freeMatch[1],
          endTime: freeMatch[2],
          label: "Optimal Rush-Free Window",
          description: "Verified rush-free window from destination metadata."
        });
      }
    }

    // Default domain baseline if no metadata exists
    if (recommendedWindows.length === 0 && busyWindows.length === 0) {
      recommendedWindows.push({
        startTime: "07:30",
        endTime: "10:30",
        label: "Early Morning Window",
        description: "Standard lower-crowd window before main group arrivals (domain baseline)."
      });
      busyWindows.push({
        startTime: "11:30",
        endTime: "15:30",
        label: "Midday Peak Window",
        description: "Standard peak tourist arrival window (domain baseline)."
      });
    }

    return { recommendedWindows, busyWindows };
  }
}

export const baselineCrowdPredictor = new BaselineCrowdPredictor();
