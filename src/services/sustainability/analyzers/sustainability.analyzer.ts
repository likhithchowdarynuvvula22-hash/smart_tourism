import {
  DestinationSustainabilityDto,
  VerifiedSustainabilityAttributeDto,
  SustainabilityAttributeType,
  LowImpactOptionDto,
  TransportContextDto,
  CarbonAssessmentDto,
  SustainabilityStatus,
  SustainabilityDataQualityStatus,
  SustainabilityFilterOptions
} from "../../../types/sustainability";
import { ProvenanceSource } from "../../../types/ai";
import {
  AttractionRow,
  ExperienceRow,
  LocalBusinessRow,
  AccessibilityRow
} from "../../../types/database.types";

// ---------------------------------------------------------------------------
// Keyword sets — PROTOTYPE DETERMINISTIC RULES (not ML-learned weights)
// ---------------------------------------------------------------------------

const ECO_EXPERIENCE_KEYWORDS = [
  "eco tourism",
  "eco-tourism",
  "ecological",
  "eco-wellness",
  "eco ",
  "community",
  "tribal",
  "village",
  "homestay experience",
  "local experience",
  "rural",
  "nature walk",
  "forest experience"
];

const NATURE_ATTRACTION_CATEGORY_KEYWORDS = [
  "wildlife",
  "natural",
  "lake",
  "waterfall",
  "forest",
  "reserve",
  "sanctuary",
  "scenic",
  "botanical",
  "bird"
];

/**
 * Railway proximity threshold below which rail access is noted qualitatively.
 * No carbon calculation is performed — this is a distance note only.
 */
const RAILWAY_ACCESSIBLE_DISTANCE_KM = 30;

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export class SustainabilityAnalyzer {
  /**
   * Detects eco/community-oriented experiences from verified database names.
   * GROUNDING: match on explicit keyword in name only — category alone does NOT qualify.
   */
  detectEcoExperiences(experiences: ExperienceRow[]): VerifiedSustainabilityAttributeDto[] {
    const results: VerifiedSustainabilityAttributeDto[] = [];
    for (const exp of experiences) {
      const nameLower = (exp.name || "").toLowerCase();
      if (!ECO_EXPERIENCE_KEYWORDS.some((kw) => nameLower.includes(kw))) continue;
      const isCommunity =
        nameLower.includes("community") ||
        nameLower.includes("tribal") ||
        nameLower.includes("village") ||
        nameLower.includes("rural");
      const type: SustainabilityAttributeType = isCommunity
        ? "community_experience"
        : "eco_experience";
      results.push({
        type,
        label: isCommunity ? "Community / Local Experience" : "Eco-Oriented Experience",
        description: `"${exp.name}" — verified ${exp.category || "tourism"} project. Name indicates ${isCommunity ? "community/local" : "eco-oriented"} character.`,
        entityId: exp.id,
        entityName: exp.name,
        entityType: "experience",
        verified: exp.verified ?? false,
        verificationStatus: exp.verification_status || "source_document",
        source: {
          type: "database",
          provider: exp.source || "Government Tourism",
          resource: "experiences"
        },
        sourceUrl: exp.source_url || null,
        disclaimer:
          "Government of India tourism development project. Name indicates eco/community orientation per official records. NOT a verified eco-certification, carbon-neutral claim, or environmental impact assessment."
      });
    }
    return results;
  }

  /**
   * Detects nature/wildlife attractions from verified category strings.
   * GROUNDING: nature attraction ≠ eco-certified or low-impact.
   */
  detectNatureAttractions(attractions: AttractionRow[]): VerifiedSustainabilityAttributeDto[] {
    const results: VerifiedSustainabilityAttributeDto[] = [];
    for (const attr of attractions) {
      const catLower = (attr.category || "").toLowerCase();
      if (!NATURE_ATTRACTION_CATEGORY_KEYWORDS.some((kw) => catLower.includes(kw))) continue;
      results.push({
        type: "nature_attraction",
        label: "Nature / Wildlife Context",
        description: `"${attr.name}" — category: "${attr.category}". Nature-context attraction per verified category.`,
        entityId: attr.id,
        entityName: attr.name,
        entityType: "attraction",
        verified:
          attr.verification_status === "official" ||
          attr.verification_status === "official_approved",
        verificationStatus: attr.verification_status || "source_document",
        source: {
          type: "database",
          provider: attr.source || "India Tourism",
          resource: "attractions"
        },
        sourceUrl: attr.source_url || null,
        disclaimer:
          "Categorized as nature/wildlife context per verified category field. NOT a protected-area certification, eco-tourism accreditation, or sustainability score. No environmental management practices are claimed."
      });
    }
    return results;
  }

  /**
   * Detects community accommodation from verified homestay businesses.
   * GROUNDING: verified homestay ≠ environmentally sustainable.
   */
  detectCommunityAccommodation(
    businesses: LocalBusinessRow[]
  ): VerifiedSustainabilityAttributeDto[] {
    return businesses
      .filter((b) => b.verified && (b.type || "").toLowerCase().includes("homestay"))
      .map((b) => ({
        type: "community_accommodation" as SustainabilityAttributeType,
        label: "Community Accommodation Option",
        description: `"${b.name}" — verified community homestay (${b.type}). Official government-approved.`,
        entityId: b.id,
        entityName: b.name,
        entityType: "business" as const,
        verified: b.verified ?? false,
        verificationStatus: b.verification_status || "official_approved",
        source: {
          type: "database" as const,
          provider: b.source || "Kerala Tourism",
          resource: "local_businesses"
        },
        sourceUrl: b.source_url || null,
        disclaimer:
          "Government-approved community homestay. Does NOT automatically imply lower environmental impact, eco-certification, or reduced carbon footprint."
      }));
  }

  /**
   * Detects walking accessibility context from attraction-level records.
   * GROUNDING: "walking possible" ≠ "zero carbon" or "eco-friendly."
   */
  detectWalkingAccessContext(
    attractions: AttractionRow[],
    accessibilityRecords: AccessibilityRow[]
  ): VerifiedSustainabilityAttributeDto[] {
    const accByAttrId = new Map(accessibilityRecords.map((a) => [a.attraction_id, a]));
    const results: VerifiedSustainabilityAttributeDto[] = [];
    for (const attr of attractions) {
      const acc = accByAttrId.get(attr.id);
      if (!acc) continue;
      const diff = (acc.walking_difficulty || "").toLowerCase();
      if (diff !== "low" && diff !== "medium") continue;
      results.push({
        type: "walking_access",
        label: "On-Foot Exploration Possible",
        description: `"${attr.name}" — walking difficulty: ${acc.walking_difficulty} (verified by ${acc.source || "official source"}).`,
        entityId: attr.id,
        entityName: attr.name,
        entityType: "attraction",
        verified: true,
        verificationStatus: acc.verification_status || "official_walk_access_verified",
        source: {
          type: "database",
          provider: acc.source || "Official Tourism",
          resource: "accessibility"
        },
        sourceUrl: acc.source_url || null,
        disclaimer:
          "Walking access based on verified accessibility records. NOT claimed to be zero-carbon or emission-free. Individual accessibility needs must be assessed independently."
      });
    }
    return results;
  }

  /**
   * Builds transport connectivity context.
   * Railway proximity noted qualitatively — NO carbon calculation performed.
   */
  buildTransportContext(
    destinationId: string,
    transportRow: {
      nearest_railway: string | null;
      railway_distance_km: number | null;
      nearest_airport: string | null;
      airport_distance_km: number | null;
      highway_access: string | null;
      source: string | null;
      source_url: string | null;
      verification_status: string | null;
    } | null
  ): TransportContextDto | null {
    if (!transportRow) return null;
    let railwayNote: string | null = null;
    if (
      transportRow.nearest_railway &&
      transportRow.railway_distance_km !== null &&
      transportRow.railway_distance_km <= RAILWAY_ACCESSIBLE_DISTANCE_KM
    ) {
      railwayNote = `"${transportRow.nearest_railway}" railway station is approximately ${transportRow.railway_distance_km} km away. Rail travel is generally considered a lower-emission travel mode per general knowledge — no emission calculation is performed by this system.`;
    }
    return {
      destinationId,
      nearestRailway: transportRow.nearest_railway,
      railwayDistanceKm: transportRow.railway_distance_km,
      nearestAirport: transportRow.nearest_airport,
      airportDistanceKm: transportRow.airport_distance_km,
      highwayAccess: transportRow.highway_access,
      railwayNote,
      source: {
        type: "database",
        provider: transportRow.source || "Official Tourism",
        resource: "transport_connectivity"
      }
    };
  }

  /** Carbon assessment — always unavailable in Phase 7H. */
  buildCarbonAssessment(): CarbonAssessmentDto {
    return {
      status: "unavailable",
      value: null,
      unit: null,
      methodology: null,
      explanation:
        "Verified transport mode, emission factors, and fuel consumption data are not available in the current database for a defensible carbon calculation. The system does not estimate CO2 using unverified distance × emission factor formulas."
    };
  }

  /** Builds low-impact options with "lower travel burden" language — NOT "lower carbon." */
  buildLowImpactOptions(
    transportCtx: TransportContextDto | null,
    allAttributes: VerifiedSustainabilityAttributeDto[],
    destination: { name: string; rush_free_hours?: string | null }
  ): LowImpactOptionDto[] {
    const options: LowImpactOptionDto[] = [];
    if (transportCtx?.railwayNote) {
      options.push({
        type: "railway_travel",
        label: "Rail Travel Option Available",
        description: transportCtx.railwayNote,
        basis: `Verified railway distance: ${transportCtx.railwayDistanceKm} km to ${transportCtx.nearestRailway}`,
        caveat:
          "Qualitative note based on proximity data only. No emission value calculated. Actual travel choice depends on availability and individual needs."
      });
    }
    const communityStays = allAttributes.filter((a) => a.type === "community_accommodation");
    if (communityStays.length > 0) {
      options.push({
        type: "community_stay",
        label: "Community Accommodation Available",
        description: `${communityStays.length} verified community homestay(s) near ${destination.name}.`,
        basis: "Verified local_businesses records (Kerala Tourism official registry)",
        caveat:
          "Does NOT automatically imply lower environmental impact. Noted for travellers who prefer to support local communities."
      });
    }
    const ecoExps = allAttributes.filter(
      (a) => a.type === "eco_experience" || a.type === "community_experience"
    );
    if (ecoExps.length > 0) {
      options.push({
        type: "local_experience",
        label: "Eco / Community Experiences Available",
        description: `${ecoExps.length} verified eco/community-oriented experience(s) at this destination.`,
        basis: "Verified experiences records (Government of India tourism projects)",
        caveat: "NOT a verified eco-certification or environmental impact assessment."
      });
    }
    const walkOpts = allAttributes.filter((a) => a.type === "walking_access");
    if (walkOpts.length > 0) {
      options.push({
        type: "walking",
        label: "On-Foot Exploration at Nearby Attractions",
        description: `${walkOpts.length} attraction(s) have verified walkable access (low/medium difficulty).`,
        basis: "Verified accessibility records",
        caveat:
          "Not claimed to be zero-carbon. Individual accessibility must be assessed independently."
      });
    }
    if (destination.rush_free_hours) {
      options.push({
        type: "off_peak_timing",
        label: "Lower-Crowd Timing Available",
        description: `Visit during off-peak hours to reduce congestion: ${destination.rush_free_hours}`,
        basis: "Verified rush-free hours from destination records",
        caveat: "Does NOT claim a specific reduction in carbon emissions."
      });
    }
    return options;
  }

  // ---------------------------------------------------------------------------
  // PROTOTYPE DETERMINISTIC RULES — sustainability status
  // ---------------------------------------------------------------------------

  private determineSustainabilityStatus(
    ecoExpCount: number,
    communityExpCount: number,
    natureAttrCount: number
  ): SustainabilityStatus {
    const total = ecoExpCount + communityExpCount + natureAttrCount;
    if (total === 0) return "unknown";
    if (total >= 2) return "favorable";
    return "mixed";
  }

  private determineDataQuality(
    ecoExpCount: number,
    communityExpCount: number,
    natureAttrCount: number,
    communityAccCount: number,
    hasTransport: boolean
  ): { status: SustainabilityDataQualityStatus; explanation: string } {
    const direct = ecoExpCount + communityExpCount + natureAttrCount;
    if (direct >= 1) {
      return {
        status: "sufficient",
        explanation: `${direct} direct sustainability-relevant record(s) found (eco/community experiences or nature attractions).`
      };
    }
    if (communityAccCount > 0 || hasTransport) {
      return {
        status: "limited",
        explanation:
          "Only indirect sustainability signals found (community accommodation or transport connectivity). No verified eco experiences or nature attractions indexed."
      };
    }
    return {
      status: "insufficient",
      explanation:
        "No verified sustainability-relevant evidence available. This does NOT mean the destination is unsustainable — only that the current database lacks indexable eco/community evidence."
    };
  }

  /**
   * Confidence score — null unless ≥2 independent verified signals.
   * PROTOTYPE: 0.6 base + 0.1 per additional signal, max 0.9.
   */
  private computeConfidence(totalSignals: number): number | null {
    if (totalSignals < 2) return null;
    return Math.min(0.6 + (totalSignals - 2) * 0.1, 0.9);
  }

  /**
   * Full normalized sustainability assessment for a destination.
   */
  assess(
    destination: { id: string; name: string; state: string; rush_free_hours?: string | null },
    experiences: ExperienceRow[],
    attractions: AttractionRow[],
    businesses: LocalBusinessRow[],
    accessibilityRecords: AccessibilityRow[],
    transportRow: Parameters<typeof this.buildTransportContext>[1],
    _options: SustainabilityFilterOptions = {}
  ): DestinationSustainabilityDto {
    const ecoExps = this.detectEcoExperiences(experiences);
    const communityExps = ecoExps.filter((e) => e.type === "community_experience");
    const ecoExpOnly = ecoExps.filter((e) => e.type === "eco_experience");
    const natureAttrs = this.detectNatureAttractions(attractions);
    const communityAccommodation = this.detectCommunityAccommodation(businesses);
    const walkingAccess = this.detectWalkingAccessContext(attractions, accessibilityRecords);
    const transportCtx = this.buildTransportContext(destination.id, transportRow);

    const railwayAttribute: VerifiedSustainabilityAttributeDto[] = transportCtx?.railwayNote
      ? [
          {
            type: "railway_access",
            label: "Railway Access Available",
            description: transportCtx.railwayNote,
            entityId: transportCtx.destinationId,
            entityName: transportCtx.nearestRailway || "Nearest Railway",
            entityType: "transport",
            verified: true,
            verificationStatus: "official",
            source: transportCtx.source,
            sourceUrl: null,
            disclaimer:
              "Railway proximity is a qualitative lower-emission travel note based on verified distance data. No carbon value is calculated."
          }
        ]
      : [];

    const allAttributes: VerifiedSustainabilityAttributeDto[] = [
      ...ecoExps,
      ...natureAttrs,
      ...communityAccommodation,
      ...walkingAccess,
      ...railwayAttribute
    ];

    const communityOptions: VerifiedSustainabilityAttributeDto[] = [
      ...communityExps,
      ...communityAccommodation
    ];

    const lowImpactOptions = this.buildLowImpactOptions(transportCtx, allAttributes, {
      name: destination.name,
      rush_free_hours: destination.rush_free_hours
    });

    const carbonAssessment = this.buildCarbonAssessment();

    const { status: dqStatus, explanation: dqExplanation } = this.determineDataQuality(
      ecoExpOnly.length,
      communityExps.length,
      natureAttrs.length,
      communityAccommodation.length,
      transportCtx !== null
    );

    const sustainabilityStatus = this.determineSustainabilityStatus(
      ecoExpOnly.length,
      communityExps.length,
      natureAttrs.length
    );

    const totalSignals =
      ecoExpOnly.length +
      communityExps.length +
      natureAttrs.length +
      communityAccommodation.length +
      (transportCtx?.railwayNote ? 1 : 0) +
      walkingAccess.length;
    const confidence = this.computeConfidence(totalSignals);

    const unknowns = [
      "eco_certifications_and_green_labels",
      "carbon_emission_factors_and_fuel_consumption",
      "protected_area_status",
      "waste_management_practices",
      "renewable_energy_usage",
      "biodiversity_assessments",
      "sustainability_scores_or_ratings",
      "community_income_and_economic_impact_data"
    ];

    const recommendations: string[] = [];
    if (ecoExps.length > 0) {
      recommendations.push(
        `Consider the ${ecoExps.length} verified eco/community-oriented experience(s) at this destination (Government of India tourism projects).`
      );
    }
    if (communityAccommodation.length > 0) {
      recommendations.push(
        `${communityAccommodation.length} verified community homestay(s) available — contact operators for specific sustainability practices.`
      );
    }
    if (transportCtx?.railwayNote) {
      recommendations.push(
        `Rail travel may be a lower-emission alternative to flying: ${transportCtx.nearestRailway} is approximately ${transportCtx.railwayDistanceKm} km away.`
      );
    }
    if (destination.rush_free_hours) {
      recommendations.push(
        `Visit during off-peak hours to reduce congestion: ${destination.rush_free_hours}`
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        "No verified sustainability evidence is currently indexed for this destination. Contact local tourism authorities for eco-tourism options."
      );
    }

    const warnings: string[] = [];
    if (sustainabilityStatus === "unknown") {
      warnings.push(
        "Sustainability status is unknown — this does NOT mean the destination is unsustainable. The database lacks indexable eco/sustainability evidence for this destination."
      );
    }

    const sources: ProvenanceSource[] = [];
    if (ecoExps.length > 0) {
      sources.push({
        type: "database",
        provider: "Government of India Tourism",
        resource: "experiences"
      });
    }
    if (natureAttrs.length > 0) {
      sources.push({
        type: "database",
        provider: "India Tourism Attractions",
        resource: "attractions"
      });
    }
    if (communityAccommodation.length > 0) {
      sources.push({ type: "database", provider: "Kerala Tourism", resource: "local_businesses" });
    }
    if (transportCtx) {
      sources.push(transportCtx.source);
    }
    sources.push({
      type: "database",
      provider: "India State-wise Tourist Destinations",
      resource: "destinations"
    });

    return {
      destinationId: destination.id,
      destinationName: destination.name,
      state: destination.state,
      sustainabilityStatus,
      confidence,
      dataQuality: {
        status: dqStatus,
        evidenceCount: allAttributes.length,
        ecoExperienceCount: ecoExpOnly.length,
        communityExperienceCount: communityExps.length,
        natureAttractionCount: natureAttrs.length,
        communityAccommodationCount: communityAccommodation.length,
        transportContextAvailable: transportCtx !== null,
        explanation: dqExplanation
      },
      verifiedAttributes: allAttributes,
      communityOptions,
      lowImpactOptions,
      knownTransportContext: transportCtx,
      carbonAssessment,
      rushFreeHours: destination.rush_free_hours || null,
      recommendations,
      unknowns,
      warnings,
      disclaimer:
        "All sustainability signals are based strictly on verified database records. This assessment does NOT include eco-certifications, carbon emission calculations, protected-area status, waste management practices, or any environmental impact measurements. Absence of sustainability data does NOT indicate the destination is unsustainable.",
      sources
    };
  }
}

export const sustainabilityAnalyzer = new SustainabilityAnalyzer();
