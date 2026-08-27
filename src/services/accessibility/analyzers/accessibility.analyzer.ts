import { Database } from "../../../types/database.types";
import {
  AccessibilityStatus,
  AccessibilityDataQuality,
  AccessibilityDataQualityStatus,
  AttractionAccessibilityDto,
  DestinationAccessibilityAssessmentDto
} from "../../../types/accessibility";

type AccessibilityRow = Database["public"]["Tables"]["accessibility"]["Row"];

export interface AccessibilityAssessmentInput {
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
  accessibilityRows: AccessibilityRow[];
  weatherForecast?: {
    precipitationProbability?: number | null;
    weatherCondition?: string | null;
  } | null;
  routingContext?: {
    totalDrivingDistanceKm?: number | null;
    totalDrivingDurationMinutes?: number | null;
  } | null;
}

export class AccessibilityAnalyzer {
  /**
   * Deterministically evaluates verified accessibility data for a destination and its attractions.
   */
  assess(input: AccessibilityAssessmentInput): DestinationAccessibilityAssessmentDto {
    const {
      destinationId,
      destinationName,
      state,
      targetDate,
      attractions,
      accessibilityRows,
      weatherForecast,
      routingContext
    } = input;

    const sources: Array<{ type: "database" | "external"; provider: string; resource: string }> = [
      { type: "database", provider: "Supabase", resource: "destinations" },
      { type: "database", provider: "Supabase", resource: "attractions" }
    ];

    if (accessibilityRows.length > 0) {
      sources.push({
        type: "database",
        provider: "Supabase",
        resource: "accessibility"
      });
    }

    const evidenceAvailable: string[] = [];
    const evidenceUnavailable: string[] = [];

    // Map accessibility rows by attraction_id
    const accMap = new Map<string, AccessibilityRow>();
    for (const row of accessibilityRows) {
      accMap.set(row.attraction_id, row);
    }

    const suitableAttractions: AttractionAccessibilityDto[] = [];
    const limitedAttractions: AttractionAccessibilityDto[] = [];
    const unknownAttractions: AttractionAccessibilityDto[] = [];
    const unsupportedAttractions: AttractionAccessibilityDto[] = [];
    const verifiedFacilitiesSet = new Set<string>();

    for (const attraction of attractions) {
      const acc = accMap.get(attraction.id);

      if (!acc) {
        const dto: AttractionAccessibilityDto = {
          attractionId: attraction.id,
          attractionName: attraction.name,
          category: attraction.category,
          status: "unknown",
          wheelchairAccess: null,
          ramps: null,
          lifts: null,
          accessibleToilet: null,
          restingAreas: null,
          walkingDifficulty: null,
          stepsCount: null,
          medicalDistanceKm: null,
          accessibleTransport: null,
          verifiedFacilities: []
        };
        unknownAttractions.push(dto);
        continue;
      }

      const facilities: string[] = [];
      if (acc.wheelchair_access === true) facilities.push("wheelchair_accessible");
      if (acc.ramps === true) facilities.push("ramps");
      if (acc.lifts === true) facilities.push("lifts");
      if (acc.accessible_toilet === true) facilities.push("accessible_toilets");
      if (acc.resting_areas === true) facilities.push("resting_areas");
      if (acc.accessible_transport === true) facilities.push("accessible_transit");

      for (const f of facilities) {
        verifiedFacilitiesSet.add(f);
      }

      // Determine attraction status
      let status: AccessibilityStatus = "unknown";

      const hasExplicitWheelchairNo = acc.wheelchair_access === false;
      const hasHighBarrierSteps =
        acc.steps_count !== null &&
        acc.steps_count >= 50 &&
        acc.ramps !== true &&
        acc.lifts !== true;
      const hasHighWalkingDifficulty =
        acc.walking_difficulty === "High" && acc.wheelchair_access !== true;

      const hasWheelchairSupport = acc.wheelchair_access === true;
      const hasRampsAndAmenities =
        acc.ramps === true && (acc.accessible_toilet === true || acc.lifts === true);

      if (hasWheelchairSupport || hasRampsAndAmenities) {
        status = "supported";
      } else if (hasExplicitWheelchairNo || hasHighBarrierSteps || hasHighWalkingDifficulty) {
        status = "not_supported";
      } else if (
        facilities.length > 0 ||
        acc.walking_difficulty === "Medium" ||
        acc.accessible_transport === true
      ) {
        status = "partially_supported";
      } else {
        status = "unknown";
      }

      const dto: AttractionAccessibilityDto = {
        attractionId: attraction.id,
        attractionName: attraction.name,
        category: attraction.category,
        status,
        wheelchairAccess: acc.wheelchair_access,
        ramps: acc.ramps,
        lifts: acc.lifts,
        accessibleToilet: acc.accessible_toilet,
        restingAreas: acc.resting_areas,
        walkingDifficulty: acc.walking_difficulty,
        stepsCount: acc.steps_count,
        medicalDistanceKm: acc.medical_distance_km,
        accessibleTransport: acc.accessible_transport,
        verifiedFacilities: facilities,
        verificationStatus: acc.verification_status,
        lastVerified: acc.last_verified,
        source: acc.source,
        sourceUrl: acc.source_url
      };

      if (status === "supported") {
        suitableAttractions.push(dto);
      } else if (status === "partially_supported") {
        limitedAttractions.push(dto);
      } else if (status === "not_supported") {
        unsupportedAttractions.push(dto);
      } else {
        unknownAttractions.push(dto);
      }
    }

    // Evidence tracking
    const verifiedFacilities = Array.from(verifiedFacilitiesSet);
    if (verifiedFacilities.length > 0) {
      evidenceAvailable.push(...verifiedFacilities.map((f) => `verified_${f}`));
    }
    if (accessibilityRows.some((r) => r.walking_difficulty !== null)) {
      evidenceAvailable.push("verified_walking_difficulty_metrics");
    }
    if (accessibilityRows.some((r) => r.steps_count !== null)) {
      evidenceAvailable.push("verified_steps_count_metrics");
    }

    if (!verifiedFacilities.includes("wheelchair_accessible")) {
      evidenceUnavailable.push("verified_wheelchair_accessibility");
    }
    if (!verifiedFacilities.includes("ramps")) {
      evidenceUnavailable.push("verified_ramps_infrastructure");
    }
    if (!verifiedFacilities.includes("lifts")) {
      evidenceUnavailable.push("verified_lifts_elevators");
    }
    if (!verifiedFacilities.includes("accessible_toilets")) {
      evidenceUnavailable.push("verified_accessible_restrooms");
    }

    // Data Quality Assessment
    const totalAttractionsCount = attractions.length;
    const verifiedAttractionsCount = accessibilityRows.length;
    let dataQualityStatus: AccessibilityDataQualityStatus = "insufficient";
    let dataQualityExplanation = "";

    if (
      verifiedAttractionsCount > 0 &&
      (suitableAttractions.length > 0 ||
        unsupportedAttractions.length > 0 ||
        verifiedFacilities.length > 0)
    ) {
      dataQualityStatus = "sufficient";
      dataQualityExplanation =
        "Verified attraction-level accessibility features and infrastructure records are available.";
    } else if (verifiedAttractionsCount > 0) {
      dataQualityStatus = "limited";
      dataQualityExplanation =
        "Limited accessibility metadata is indexed for attractions in this destination. Exercise personal discretion.";
    } else {
      dataQualityStatus = "insufficient";
      dataQualityExplanation =
        "No verified accessibility records or wheelchair support data are currently indexed for attractions in this destination.";
    }

    // Destination Accessibility Status Model
    let accessibilityStatus: AccessibilityStatus = "unknown";
    let confidence = 0.5;

    if (dataQualityStatus === "sufficient") {
      if (suitableAttractions.length > 0 && unsupportedAttractions.length === 0) {
        accessibilityStatus = "supported";
        confidence = 0.85;
      } else if (suitableAttractions.length > 0 && unsupportedAttractions.length > 0) {
        accessibilityStatus = "partially_supported";
        confidence = 0.8;
      } else if (limitedAttractions.length > 0) {
        accessibilityStatus = "partially_supported";
        confidence = 0.75;
      } else if (
        unsupportedAttractions.length > 0 &&
        suitableAttractions.length === 0 &&
        limitedAttractions.length === 0 &&
        unknownAttractions.length === 0
      ) {
        accessibilityStatus = "not_supported";
        confidence = 0.85;
      } else {
        accessibilityStatus = "unknown";
        confidence = 0.6;
      }
    } else if (dataQualityStatus === "limited") {
      if (limitedAttractions.length > 0) {
        accessibilityStatus = "partially_supported";
        confidence = 0.6;
      } else {
        accessibilityStatus = "unknown";
        confidence = 0.5;
      }
    } else {
      // Insufficient data -> unknown
      accessibilityStatus = "unknown";
      confidence = 0.25;
    }

    // Terrain Assessment (Strict Grounding: NEVER fabricate slope/gradient/terrain)
    const terrainAssessment = "unavailable";

    // Recommendations & Warnings
    const recommendations: string[] = [];
    const warnings: string[] = [];
    const routingNotes: string[] = [];
    const weatherNotes: string[] = [];

    if (suitableAttractions.length > 0) {
      recommendations.push(
        `Verified wheelchair-accessible attractions: ${suitableAttractions.map((a) => a.attractionName).join(", ")}.`
      );
    }

    if (limitedAttractions.length > 0) {
      recommendations.push(
        `Attractions with partial accessibility support: ${limitedAttractions.map((a) => a.attractionName).join(", ")}.`
      );
    }

    if (unsupportedAttractions.length > 0) {
      warnings.push(
        `Mobility Barrier Caution: ${unsupportedAttractions
          .map((a) =>
            a.stepsCount
              ? `${a.attractionName} (${a.stepsCount} stairs, no ramps verified)`
              : `${a.attractionName} (high walking difficulty/no wheelchair access)`
          )
          .join("; ")}.`
      );
    }

    if (accessibilityStatus === "unknown" || dataQualityStatus === "insufficient") {
      warnings.push(
        "Destination-specific accessibility data is unindexed. Do not assume universal physical accessibility without operator verification."
      );
    }

    // Weather considerations (Contextual only; does not fabricate physical accessibility)
    if (weatherForecast) {
      sources.push({ type: "external", provider: "Open-Meteo", resource: "weather" });
      if (
        weatherForecast.precipitationProbability !== null &&
        weatherForecast.precipitationProbability !== undefined &&
        weatherForecast.precipitationProbability > 60
      ) {
        weatherNotes.push(
          `Weather Alert (${weatherForecast.precipitationProbability}% rain probability): Rain is forecasted for the target date. Outdoor pathways may become slippery; verify indoor transition corridors.`
        );
      }
    }

    // Routing considerations (Distance/Duration only; does not convert driving to walking difficulty)
    if (routingContext) {
      sources.push({ type: "external", provider: "OSRM", resource: "routing" });
      if (
        routingContext.totalDrivingDistanceKm !== null &&
        routingContext.totalDrivingDurationMinutes !== null
      ) {
        routingNotes.push(
          `Estimated inter-attraction driving transit: ${routingContext.totalDrivingDistanceKm} km (${routingContext.totalDrivingDurationMinutes} mins). Note: Road transit duration does not represent walking path difficulty.`
        );
      }
    }

    const disclaimer =
      "Disclaimer: Accessibility intelligence is synthesized strictly from official government registries, verified attraction metadata, and public infrastructure records. The absence of barrier records does not guarantee universal physical accessibility. Travellers requiring specific mobility accommodations are advised to confirm directly with attraction operators.";

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
      accessibilityStatus,
      confidence,
      dataQuality,
      terrainAssessment,
      verifiedFacilities,
      suitableAttractions,
      limitedAttractions,
      unknownAttractions,
      unsupportedAttractions,
      routingNotes: routingNotes.length > 0 ? routingNotes : undefined,
      weatherNotes: weatherNotes.length > 0 ? weatherNotes : undefined,
      recommendations,
      warnings,
      disclaimer,
      sources
    };
  }
}

export const accessibilityAnalyzer = new AccessibilityAnalyzer();
