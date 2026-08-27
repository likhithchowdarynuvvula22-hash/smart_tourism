import { Database } from "../../../types/database.types";
import {
  ElderlySuitability,
  AccessibilityDataQuality,
  AccessibilityDataQualityStatus,
  AttractionElderlySupportDto,
  DestinationElderlyAssessmentDto
} from "../../../types/accessibility";

type ElderlySupportRow = Database["public"]["Tables"]["elderly_support"]["Row"];
type AccessibilityRow = Database["public"]["Tables"]["accessibility"]["Row"];
type OpeningHoursRow = Database["public"]["Tables"]["opening_hours"]["Row"];
type EntryFeesRow = Database["public"]["Tables"]["entry_fees"]["Row"];

export interface ElderlyTravelAssessmentInput {
  destinationId: string;
  destinationName: string;
  state?: string | null;
  targetDate?: string;
  attractions: Array<{
    id: string;
    name: string;
    category: string | null;
    description?: string | null;
  }>;
  elderlySupportRows: ElderlySupportRow[];
  accessibilityRows?: AccessibilityRow[];
  openingHoursRows?: OpeningHoursRow[];
  entryFeesRows?: EntryFeesRow[];
  weatherForecast?: {
    precipitationProbability?: number | null;
    temperatureMax?: number | null;
    temperatureMin?: number | null;
    weatherCondition?: string | null;
  } | null;
  routingContext?: {
    totalDrivingDistanceKm?: number | null;
    totalDrivingDurationMinutes?: number | null;
  } | null;
}

export class ElderlyTravelAnalyzer {
  /**
   * Deterministically evaluates verified senior citizen and elderly travel suitability.
   */
  assess(input: ElderlyTravelAssessmentInput): DestinationElderlyAssessmentDto {
    const {
      destinationId,
      destinationName,
      state,
      targetDate,
      attractions,
      elderlySupportRows,
      accessibilityRows = [],
      openingHoursRows = [],
      entryFeesRows = [],
      weatherForecast,
      routingContext
    } = input;

    const sources: Array<{ type: "database" | "external"; provider: string; resource: string }> = [
      { type: "database", provider: "Supabase", resource: "destinations" },
      { type: "database", provider: "Supabase", resource: "attractions" }
    ];

    if (elderlySupportRows.length > 0) {
      sources.push({
        type: "database",
        provider: "Supabase",
        resource: "elderly_support"
      });
    }

    if (accessibilityRows.length > 0) {
      sources.push({
        type: "database",
        provider: "Supabase",
        resource: "accessibility"
      });
    }

    if (openingHoursRows.length > 0) {
      sources.push({
        type: "database",
        provider: "Supabase",
        resource: "opening_hours"
      });
    }

    if (entryFeesRows.length > 0) {
      sources.push({
        type: "database",
        provider: "Supabase",
        resource: "entry_fees"
      });
    }

    const evidenceAvailable: string[] = [];
    const evidenceUnavailable: string[] = [];

    // Map rows by attraction_id
    const eldMap = new Map<string, ElderlySupportRow>();
    for (const row of elderlySupportRows) eldMap.set(row.attraction_id, row);

    const accMap = new Map<string, AccessibilityRow>();
    for (const row of accessibilityRows) accMap.set(row.attraction_id, row);

    const ohMap = new Map<string, OpeningHoursRow>();
    for (const row of openingHoursRows) ohMap.set(row.attraction_id, row);

    const efMap = new Map<string, EntryFeesRow>();
    for (const row of entryFeesRows) efMap.set(row.attraction_id, row);

    const suitableAttractions: AttractionElderlySupportDto[] = [];
    const conditionallySuitableAttractions: AttractionElderlySupportDto[] = [];
    const notRecommendedAttractions: AttractionElderlySupportDto[] = [];
    const unknownAttractions: AttractionElderlySupportDto[] = [];

    let hasVerifiedBenches = false;

    for (const attraction of attractions) {
      const eld = eldMap.get(attraction.id);
      const acc = accMap.get(attraction.id);
      const oh = ohMap.get(attraction.id);
      const ef = efMap.get(attraction.id);

      if (!eld && !acc) {
        const dto: AttractionElderlySupportDto = {
          attractionId: attraction.id,
          attractionName: attraction.name,
          category: attraction.category,
          suitability: "unknown",
          benches: null,
          ramps: null,
          lifts: null,
          accessibleToilet: null,
          stairs: null,
          seniorEntryFee: ef?.fee_senior || null,
          currency: ef?.currency || "INR",
          openingHours: oh
            ? {
                openingTime: oh.opening_time,
                closingTime: oh.closing_time,
                seasonalNotes: oh.seasonal_notes
              }
            : null,
          verifiedFacilities: []
        };
        unknownAttractions.push(dto);
        continue;
      }

      const facilities: string[] = [];
      const benches = eld?.benches ?? acc?.resting_areas ?? null;
      const ramps = eld?.ramps ?? acc?.ramps ?? null;
      const lifts = eld?.lifts ?? acc?.lifts ?? null;
      const accessibleToilet = eld?.accessible_toilet ?? acc?.accessible_toilet ?? null;
      const stairs = eld?.stairs ?? (acc?.steps_count ? String(acc.steps_count) : null);

      if (benches === true) {
        facilities.push("resting_benches");
        hasVerifiedBenches = true;
      }
      if (ramps === true) facilities.push("ramps");
      if (lifts === true) facilities.push("lifts");
      if (accessibleToilet === true) facilities.push("accessible_toilets");
      if (acc?.accessible_transport === true) facilities.push("accessible_transport");
      if (ef?.fee_senior !== null && ef?.fee_senior !== undefined) {
        facilities.push("senior_discounted_entry");
      }

      // Check physical barriers
      const hasStairBarrier =
        (stairs && (stairs.includes("50") || parseInt(stairs, 10) >= 50)) ||
        (acc?.steps_count !== null && acc?.steps_count !== undefined && acc.steps_count >= 50);
      const hasHighWalking = acc?.walking_difficulty === "High";

      // Check split hours / timing conditions
      const hasSplitHours =
        oh?.seasonal_notes?.toLowerCase().includes("split") ||
        (oh?.closing_time && oh.closing_time.includes(";"));

      let suitability: ElderlySuitability = "unknown";

      if (hasStairBarrier && ramps !== true && lifts !== true) {
        suitability = "not_recommended";
      } else if (hasHighWalking && benches !== true) {
        suitability = "not_recommended";
      } else if (benches === true || ramps === true || lifts === true || ef?.fee_senior !== null) {
        if (hasSplitHours || acc?.walking_difficulty === "Medium") {
          suitability = "conditionally_suitable";
        } else {
          suitability = "suitable";
        }
      } else if (
        hasSplitHours ||
        acc?.walking_difficulty === "Medium" ||
        accessibleToilet === true
      ) {
        suitability = "conditionally_suitable";
      } else {
        suitability = "unknown";
      }

      const dto: AttractionElderlySupportDto = {
        attractionId: attraction.id,
        attractionName: attraction.name,
        category: attraction.category,
        suitability,
        benches,
        ramps,
        lifts,
        accessibleToilet,
        stairs,
        seniorEntryFee: ef?.fee_senior || null,
        currency: ef?.currency || "INR",
        openingHours: oh
          ? {
              openingTime: oh.opening_time,
              closingTime: oh.closing_time,
              seasonalNotes: oh.seasonal_notes
            }
          : null,
        verifiedFacilities: facilities,
        verificationStatus: eld?.verification_status || acc?.verification_status,
        lastVerified: eld?.last_verified || acc?.last_verified,
        source: eld?.source || acc?.source,
        sourceUrl: eld?.source_url || acc?.source_url
      };

      if (suitability === "suitable") {
        suitableAttractions.push(dto);
      } else if (suitability === "conditionally_suitable") {
        conditionallySuitableAttractions.push(dto);
      } else if (suitability === "not_recommended") {
        notRecommendedAttractions.push(dto);
      } else {
        unknownAttractions.push(dto);
      }
    }

    // Evidence Available / Unavailable tracking
    if (hasVerifiedBenches) {
      evidenceAvailable.push("verified_resting_benches");
    } else {
      evidenceUnavailable.push("verified_resting_benches");
    }

    if (elderlySupportRows.some((r) => r.stairs !== null)) {
      evidenceAvailable.push("verified_stair_climbing_metrics");
    }
    if (entryFeesRows.some((r) => r.fee_senior !== null)) {
      evidenceAvailable.push("verified_senior_citizen_entry_concessions");
    }
    if (openingHoursRows.length > 0) {
      evidenceAvailable.push("verified_operating_hours");
    }

    // Data Quality Assessment
    const totalAttractionsCount = attractions.length;
    const verifiedAttractionsCount = elderlySupportRows.length;
    let dataQualityStatus: AccessibilityDataQualityStatus = "insufficient";
    let dataQualityExplanation = "";

    if (
      verifiedAttractionsCount > 0 &&
      (suitableAttractions.length > 0 ||
        conditionallySuitableAttractions.length > 0 ||
        notRecommendedAttractions.length > 0)
    ) {
      dataQualityStatus = "sufficient";
      dataQualityExplanation =
        "Verified attraction-level senior amenities, resting benches, or stair counts are available.";
    } else if (verifiedAttractionsCount > 0) {
      dataQualityStatus = "limited";
      dataQualityExplanation =
        "Limited senior citizen support metadata is indexed for attractions in this destination.";
    } else {
      dataQualityStatus = "insufficient";
      dataQualityExplanation =
        "No verified elderly-support or senior amenity records are currently indexed for attractions in this destination.";
    }

    // Destination Elderly Suitability Model
    let suitability: ElderlySuitability = "unknown";
    let confidence = 0.5;

    if (dataQualityStatus === "sufficient") {
      if (suitableAttractions.length > 0 && notRecommendedAttractions.length === 0) {
        suitability = "suitable";
        confidence = 0.85;
      } else if (suitableAttractions.length > 0 && notRecommendedAttractions.length > 0) {
        suitability = "conditionally_suitable";
        confidence = 0.8;
      } else if (conditionallySuitableAttractions.length > 0) {
        suitability = "conditionally_suitable";
        confidence = 0.75;
      } else if (
        notRecommendedAttractions.length > 0 &&
        suitableAttractions.length === 0 &&
        conditionallySuitableAttractions.length === 0 &&
        unknownAttractions.length === 0
      ) {
        suitability = "not_recommended";
        confidence = 0.85;
      } else {
        suitability = "unknown";
        confidence = 0.6;
      }
    } else if (dataQualityStatus === "limited") {
      if (conditionallySuitableAttractions.length > 0) {
        suitability = "conditionally_suitable";
        confidence = 0.6;
      } else {
        suitability = "unknown";
        confidence = 0.5;
      }
    } else {
      suitability = "unknown";
      confidence = 0.25;
    }

    // Terrain Assessment (Strict Grounding: NEVER fabricate slope/gradient/terrain)
    const terrainAssessment = "unavailable";

    // Resting Benches Status
    const restingBenchesAvailability = hasVerifiedBenches
      ? "verified_available"
      : dataQualityStatus === "insufficient"
        ? "unknown"
        : "limited";

    // Pacing Guidance
    const pacingGuidance =
      "Pacing Guidance (Relaxed Travel): Plan a gentle itinerary with a maximum of 2 relaxed stops per day. Favor early morning or late afternoon visits to avoid intense mid-day heat. Allow at least 45 minutes between stops for rest and hydration.";

    // Recommendations & Warnings
    const recommendations: string[] = [pacingGuidance];
    const warnings: string[] = [];

    if (suitableAttractions.length > 0) {
      recommendations.push(
        `Senior-friendly attractions with verified resting or easy transit: ${suitableAttractions.map((a) => a.attractionName).join(", ")}.`
      );
    }

    if (conditionallySuitableAttractions.length > 0) {
      recommendations.push(
        `Attractions requiring schedule coordination (e.g. split opening hours): ${conditionallySuitableAttractions.map((a) => a.attractionName).join(", ")}.`
      );
    }

    if (notRecommendedAttractions.length > 0) {
      warnings.push(
        `Senior Physical Barrier Warning: ${notRecommendedAttractions
          .map(
            (a) =>
              `${a.attractionName} (${a.stairs ? `${a.stairs} stairs` : "high walking requirement"}, no lifts verified)`
          )
          .join("; ")}.`
      );
    }

    if (suitability === "unknown" || dataQualityStatus === "insufficient") {
      warnings.push(
        "Elderly support amenities are unindexed for this destination. Please verify resting areas and stairs directly with attraction operators before visiting."
      );
    }

    // Weather Caution
    if (weatherForecast) {
      sources.push({ type: "external", provider: "Open-Meteo", resource: "weather" });
      if (weatherForecast.temperatureMax && weatherForecast.temperatureMax > 36) {
        warnings.push(
          `High Temperature Caution (${weatherForecast.temperatureMax}°C): High ambient heat forecasted. Senior travellers should stay hydrated and minimize outdoor exposure during peak afternoon hours.`
        );
      }
    }

    // Transit Pacing & Routing Integration
    if (routingContext) {
      sources.push({ type: "external", provider: "OSRM", resource: "routing" });
      recommendations.push(
        `Transit Pacing: Inter-site road transit is estimated at ${routingContext.totalDrivingDistanceKm} km (~${routingContext.totalDrivingDurationMinutes} mins). Plan adequate rest breaks during transit.`
      );
    }

    const disclaimer =
      "Disclaimer: Senior citizen travel suitability is synthesized strictly from official metadata, published resting amenities, verified stairs/ramp indicators, and opening schedules. It does not constitute medical or physical health advice. Travellers with specific health requirements should consult medical professionals and confirm directly with site authorities.";

    const dataQuality: AccessibilityDataQuality = {
      status: dataQualityStatus,
      explanation: dataQualityExplanation,
      verifiedAttractionsCount,
      totalAttractionsCount,
      evidenceAvailable,
      evidenceUnavailable
    };

    return {
      destinationId,
      destinationName,
      state: state || undefined,
      date: targetDate,
      suitability,
      confidence,
      dataQuality,
      terrainAssessment,
      pacingGuidance,
      restingBenchesAvailability,
      suitableAttractions,
      conditionallySuitableAttractions,
      notRecommendedAttractions,
      unknownAttractions,
      recommendations,
      warnings,
      disclaimer,
      sources
    };
  }
}

export const elderlyTravelAnalyzer = new ElderlyTravelAnalyzer();
