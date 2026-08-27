import { AIProvider } from "./ai.provider";
import { OrchestratorResponseDto, ItineraryDayDto, ExtractedEntities } from "../../../types/ai";
import { DestinationCrowdDto } from "../../../types/crowd";
import { DestinationWomenSafetyDto } from "../../../types/safety";
import {
  DestinationAccessibilityAssessmentDto,
  DestinationElderlyAssessmentDto
} from "../../../types/accessibility";
import { DestinationBudgetAssessmentDto } from "../../../types/budget";
import { DestinationExperienceAssessmentDto } from "../../../types/experience";
import {
  DestinationGalleryDto,
  MultilingualContentDto,
  DestinationContentSummaryDto
} from "../../../types/content";
import { DestinationBusinessesDto } from "../../../types/business";
import { DestinationSustainabilityDto } from "../../../types/sustainability";

export class DeterministicAIProvider implements AIProvider {
  readonly providerName = "Deterministic Grounded AI Provider";

  async generateStructuredResponse<T>(prompt: string): Promise<T> {
    // If prompt contains context, parse it for deterministic fallback reasoning
    let contextData: Record<string, unknown> = {};
    try {
      const match = prompt.match(/```json\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        contextData = JSON.parse(match[1]);
      } else {
        contextData = JSON.parse(prompt);
      }
    } catch {
      // ignore parse error
    }

    const destination = (contextData.destination as Record<string, unknown>) || {};
    const attractions = (contextData.attractions as Array<Record<string, unknown>>) || [];
    const weather = (contextData.weather as Record<string, unknown>) || null;
    const safety = (contextData.safety as Record<string, unknown>) || null;
    const womenSafety = (contextData.women_safety as DestinationWomenSafetyDto) || null;
    const accessibilityAssessment =
      (contextData.accessibility_assessment as DestinationAccessibilityAssessmentDto) || null;
    const elderlyAssessment =
      (contextData.elderly_assessment as DestinationElderlyAssessmentDto) || null;
    const budgetAssessment =
      (contextData.budget_assessment as DestinationBudgetAssessmentDto) || null;
    const accessibility = (contextData.accessibility as Record<string, unknown>) || null;
    const elderlySupport = (contextData.elderly_support as Record<string, unknown>) || null;
    const crowd = (contextData.crowd as DestinationCrowdDto) || null;
    const entities = (contextData.entities as ExtractedEntities) || {};
    const destinationName = (destination.name as string) || "the requested destination";
    const durationDays = entities.days || 1;

    // Extract genuine safety score only if source-backed in context data
    let verifiedSafetyScore: number | undefined = undefined;
    if (safety && typeof safety.safetyScore === "number") {
      verifiedSafetyScore = safety.safetyScore;
    } else if (safety && typeof safety.overall_score === "number") {
      verifiedSafetyScore = safety.overall_score;
    } else if (womenSafety && womenSafety.sourceBackedScore?.score !== undefined) {
      verifiedSafetyScore = womenSafety.sourceBackedScore.score;
    }

    const intent = (contextData.intent as string) || "trip_planning";
    const isTripPlanning = intent === "trip_planning" || intent === "itinerary_help";

    // Build unique, non-duplicated day allocations ONLY for trip planning / itinerary intents
    const days: ItineraryDayDto[] = [];
    if (isTripPlanning) {
      let attractionIndex = 0;
      let fallbackUsed = false;

      for (let d = 1; d <= durationDays; d++) {
        const dayItems: ItineraryDayDto["items"] = [];

        if (attractions.length > 0) {
          const morningAttraction = attractions[attractionIndex % attractions.length];
          dayItems.push({
            sequence: 1,
            timeBlock: "morning",
            placeId: String(morningAttraction.id || `attr-${attractionIndex + 1}`),
            placeName: (morningAttraction.name as string) || "Heritage Landmark",
            reason: (morningAttraction.description as string) || "Popular cultural exploration",
            estimatedVisitMinutes: 90,
            accessibilityNotes: accessibilityAssessment
              ? [
                  `Accessibility: ${accessibilityAssessment.accessibilityStatus}`,
                  `Terrain: ${accessibilityAssessment.terrainAssessment}`
                ]
              : [],
            elderlyNotes: elderlyAssessment
              ? [
                  `Senior suitability: ${elderlyAssessment.suitability}`,
                  `Benches: ${elderlyAssessment.restingBenchesAvailability}`
                ]
              : elderlySupport
                ? ["Elderly assistance & benches verified"]
                : []
          });
          attractionIndex++;

          // Second stop if distinct attractions remain
          if (attractions.length > 1 && attractionIndex < attractions.length) {
            const afternoonAttraction = attractions[attractionIndex % attractions.length];
            dayItems.push({
              sequence: 2,
              timeBlock: "afternoon",
              placeId: String(afternoonAttraction.id || `attr-${attractionIndex + 1}`),
              placeName: (afternoonAttraction.name as string) || "Scenic Spot",
              reason:
                (afternoonAttraction.description as string) || "Relaxing afternoon experience",
              estimatedVisitMinutes: 60,
              accessibilityNotes: [],
              elderlyNotes: []
            });
            attractionIndex++;
          }
        } else if (destination.id && !fallbackUsed) {
          // Single destination-level fallback across entire itinerary
          fallbackUsed = true;
          dayItems.push({
            sequence: 1,
            timeBlock: "morning",
            placeId: String(destination.id),
            placeName: (destination.name as string) || "Scenic Highlights",
            reason:
              (destination.description as string) || "Guided exploration of scenic highlights",
            estimatedVisitMinutes: 90,
            accessibilityNotes: [],
            elderlyNotes: elderlySupport ? ["Elderly assistance & benches verified"] : []
          });
        }

        days.push({
          day: d,
          theme:
            d === 1
              ? `Scenic & Heritage Highlights of ${destinationName}`
              : `Cultural Exploration of ${destinationName}`,
          items: dayItems
        });
      }
    }

    let summary = `Here is your verified tourism guide for ${destinationName}, based on verified catalog records.`;
    const warnings: string[] = [];

    const experienceAssessment = contextData.experience_assessment as
      DestinationExperienceAssessmentDto | undefined;

    const gallery = contextData.gallery as DestinationGalleryDto | undefined;
    const multilingualContent = contextData.multilingual_content as
      MultilingualContentDto | undefined;
    const contentSummary = contextData.content_summary as DestinationContentSummaryDto | undefined;
    const businesses = contextData.businesses as DestinationBusinessesDto | undefined;
    const sustainability = contextData.sustainability as DestinationSustainabilityDto | undefined;

    if (contextData.intent === "crowd_query") {
      if (crowd) {
        summary = `Baseline crowd assessment for ${destinationName} is currently assessed as ${crowd.crowd.level} (Confidence: ${crowd.crowd.confidence}), based on rule-based heuristics as destination-specific historical observations are unavailable. ${
          crowd.recommendedWindows.length > 0
            ? `Optimal visiting window: ${crowd.recommendedWindows[0].startTime} - ${crowd.recommendedWindows[0].endTime} (from verified destination metadata).`
            : ""
        }`;
      } else {
        summary = `Historical crowd observations for ${destinationName} are currently unavailable. Baseline domain recommendations apply.`;
      }
    } else if (contextData.intent === "women_safety_query") {
      if (womenSafety) {
        summary = `Available verified data indicates emergency support and helplines for ${destinationName}: National Women Helpline (${womenSafety.emergencyResources.womenHelpline}), National Emergency (${womenSafety.emergencyResources.nationalEmergency}), Police (${womenSafety.emergencyResources.police}). Current women-safety data quality is assessed as ${womenSafety.dataQuality.status}. Risk level is evaluated as ${womenSafety.riskLevel} (Confidence: ${womenSafety.confidence}). No recent verified serious incidents are recorded in the current dataset; this does not guarantee absolute safety.`;
        if (womenSafety.warnings && womenSafety.warnings.length > 0) {
          warnings.push(...womenSafety.warnings);
        }
      } else {
        summary = `Current destination-specific women-safety data is limited or unavailable for ${destinationName}. National emergency (112) and women helpline (1091 / 181) remain standard verified emergency contacts across India.`;
      }
    } else if (contextData.intent === "accessibility_query") {
      if (accessibilityAssessment) {
        summary = `Accessibility assessment for ${destinationName}: Status is evaluated as ${accessibilityAssessment.accessibilityStatus} (Confidence: ${accessibilityAssessment.confidence}). Data quality: ${accessibilityAssessment.dataQuality.status}. ${
          accessibilityAssessment.suitableAttractions.length > 0
            ? `Verified accessible places: ${accessibilityAssessment.suitableAttractions.map((a) => a.attractionName).join(", ")}.`
            : "No verified fully wheelchair-accessible attractions are currently confirmed in the database."
        }`;
        if (accessibilityAssessment.warnings && accessibilityAssessment.warnings.length > 0) {
          warnings.push(...accessibilityAssessment.warnings);
        }
      } else {
        summary = `Current destination-specific accessibility and wheelchair data is limited or unavailable for ${destinationName}. Exercise personal travel discretion and verify physical access with attraction operators.`;
      }
    } else if (contextData.intent === "elderly_travel_query") {
      if (elderlyAssessment) {
        summary = `Senior citizen travel suitability for ${destinationName}: Evaluated as ${elderlyAssessment.suitability} (Confidence: ${elderlyAssessment.confidence}). Resting benches: ${elderlyAssessment.restingBenchesAvailability}. Pacing: ${elderlyAssessment.pacingGuidance}`;
        if (elderlyAssessment.warnings && elderlyAssessment.warnings.length > 0) {
          warnings.push(...elderlyAssessment.warnings);
        }
      } else {
        summary = `Senior citizen support amenities (resting benches, stairs/ramp indicators) are currently unindexed or unavailable for ${destinationName}. Relaxed pacing with gentle schedules is recommended.`;
      }
    } else if (contextData.intent === "budget_query") {
      if (budgetAssessment) {
        summary = `Budget & cost assessment for ${destinationName}: Known verified entry-fee subtotal is ₹${budgetAssessment.budget.knownSubtotal} (${budgetAssessment.budget.dataQuality.status} data quality). ${
          budgetAssessment.savings.length > 0
            ? `Verified concessions save up to ₹${budgetAssessment.savings.reduce((a, s) => a + s.totalSavings, 0)} across ${budgetAssessment.savings.length} attraction(s). `
            : ""
        }${
          budgetAssessment.budget.unknownCategories.length > 0
            ? "Complete trip expenditure cannot be determined because accommodation, dining, and local transit rates are uncatalogued."
            : ""
        }`;
        if (budgetAssessment.warnings && budgetAssessment.warnings.length > 0) {
          warnings.push(...budgetAssessment.warnings);
        }
      } else {
        summary = `Entry fee and cost records are currently unindexed or unavailable for ${destinationName}. Hotel, dining, and transport rates are not tracked.`;
      }
    } else if (contextData.intent === "experience_query") {
      if (experienceAssessment) {
        summary = `Cultural & experience discovery for ${destinationName}: Found ${experienceAssessment.rankedItems.length} verified local experience(s) and cultural highlight(s) matching your interests (${experienceAssessment.dataQuality.status} data quality).${
          experienceAssessment.languages?.official
            ? ` Primary regional language: ${experienceAssessment.languages.official}.`
            : ""
        }`;
        if (experienceAssessment.warnings && experienceAssessment.warnings.length > 0) {
          warnings.push(...experienceAssessment.warnings);
        }
      } else {
        summary = `No verified cultural or experience development records are currently indexed for ${destinationName}.`;
      }
    } else if (contextData.intent === "content_query") {
      if (multilingualContent) {
        summary = `Multilingual tourism content for ${destinationName} (Language: ${multilingualContent.requestedLanguage}): ${
          multilingualContent.isSupportedLocally
            ? "Officially recognized local/state language."
            : "Translated with dual-text source provenance preservation."
        }${
          multilingualContent.destinationDescription?.translated
            ? ` ${multilingualContent.destinationDescription.translated}`
            : ""
        }`;
      } else if (gallery) {
        summary = `Verified gallery & photography for ${destinationName}: Found ${gallery.images.length} image record(s) (${gallery.coverage.status} coverage). All accessible descriptions are derived strictly from verified metadata.`;
      } else if (contentSummary) {
        summary = `Verified content summary for ${destinationName}: ${contentSummary.summary}`;
      } else {
        summary = `Verified content profile for ${destinationName} retrieved from catalogued records.`;
      }
    } else if (contextData.intent === "local_business_query") {
      if (businesses) {
        summary = `Local business & commerce discovery for ${destinationName}: Found ${businesses.businesses.length} verified establishment(s) (${businesses.dataQuality.status} data quality). Commercial pricing, menus, and operating hours are not tracked; contact venue operators directly.`;
      } else {
        summary = `No verified local business records are currently indexed for ${destinationName}. Commercial pricing and opening hours are not tracked.`;
      }
    } else if (contextData.intent === "sustainability_query") {
      if (sustainability) {
        const s = sustainability;
        summary = `Sustainability assessment for ${destinationName}: Status is ${s.sustainabilityStatus} (Data quality: ${s.dataQuality.status}). ${
          s.dataQuality.ecoExperienceCount + s.dataQuality.communityExperienceCount > 0
            ? `${s.dataQuality.ecoExperienceCount + s.dataQuality.communityExperienceCount} verified eco/community-oriented experience(s) found. `
            : ""
        }${
          s.dataQuality.natureAttractionCount > 0
            ? `${s.dataQuality.natureAttractionCount} nature-context attraction(s) verified. `
            : ""
        }${
          s.dataQuality.communityAccommodationCount > 0
            ? `${s.dataQuality.communityAccommodationCount} verified community homestay(s) available. `
            : ""
        }Carbon assessment: ${s.carbonAssessment.explanation} All signals are based strictly on verified database records — no eco-certifications or emission calculations are generated by this system.`;
        if (s.warnings && s.warnings.length > 0) warnings.push(...s.warnings);
      } else {
        summary = `Sustainability and eco-tourism records are currently unindexed for ${destinationName}. Contact local tourism authorities for verified eco-tourism options. Note: absence of indexed data does NOT mean the destination is unsustainable.`;
      }
    } else if (contextData.intent === "destination_information") {
      const stateName = (destination.state as string) || "India";
      const desc = (destination.description as string) || "";
      if (
        attractions.length === 0 &&
        (!contextData.experiences || (contextData.experiences as unknown[]).length === 0)
      ) {
        summary = `${destinationName} is a verified tourism destination in ${stateName}.${desc ? " " + desc : ""} The current verified database has limited attraction and experience records specifically linked to this destination.`;
      } else {
        const attNames = attractions.map((a) => a.name).filter(Boolean);
        summary = `${destinationName} is a verified tourism destination in ${stateName}.${desc ? " " + desc : ""}${attNames.length > 0 ? " Verified attractions include: " + attNames.join(", ") + "." : ""}`;
      }
    }

    const response: OrchestratorResponseDto = {
      intent: (contextData.intent as OrchestratorResponseDto["intent"]) || "trip_planning",
      summary,
      trip: {
        destination: destinationName,
        destinationId: destination.id as string | undefined,
        durationDays: isTripPlanning ? durationDays : 1
      },
      destination: {
        id: destination.id as string,
        name: destination.name as string,
        state: destination.state as string,
        description: destination.description as string
      },
      recommendations:
        attractions.length > 0
          ? attractions.slice(0, 4).map((att) => ({
              title: (att.name as string) || "Top Attraction",
              description: (att.description as string) || "Popular destination site",
              category: (att.category as string) || "Sightseeing",
              highlights: [
                `Category: ${att.category || "Tourism"}`,
                `Entry Fee: ${att.entry_fee ? `₹${att.entry_fee}` : "Free"}`
              ]
            }))
          : destination.name
            ? [
                {
                  title: destination.name as string,
                  description:
                    (destination.description as string) ||
                    `Verified destination in ${destination.state || "India"}`,
                  category: "Destination Overview",
                  highlights: [
                    `State: ${destination.state || "India"}`,
                    `District: ${destination.district || "N/A"}`
                  ]
                }
              ]
            : [],
      days,
      itinerary: days,
      crowd,
      weather: weather ? (weather.current as OrchestratorResponseDto["weather"]) : null,
      safety: safety
        ? {
            overview:
              typeof safety.overview === "string"
                ? safety.overview
                : "Destination-specific safety information is limited.",
            safetyScore: verifiedSafetyScore,
            womenHelpline: "1091 / 112",
            emergencyHelplines: {
              Police: "100",
              Ambulance: "108",
              NationalEmergency: "112"
            }
          }
        : null,
      womenSafety,
      accessibilityAssessment,
      elderlyAssessment,
      budgetAssessment,
      experienceAssessment,
      gallery,
      multilingualContent,
      contentSummary,
      businesses: businesses || null,
      sustainability: sustainability || null,
      accessibility: {
        wheelchairSupport: Boolean(
          accessibilityAssessment?.accessibilityStatus === "supported" || accessibility
        ),
        elderlySupport: Boolean(elderlyAssessment?.suitability === "suitable" || elderlySupport),
        notes: [
          elderlyAssessment?.restingBenchesAvailability === "verified_available"
            ? "Senior citizen seating & resting benches verified"
            : "Check local entry points for ramps"
        ]
      },
      warnings,
      sources: (contextData.sources as OrchestratorResponseDto["sources"]) || [
        { type: "database", provider: "Supabase", resource: "destinations" }
      ]
    };

    return response as unknown as T;
  }

  async generateText(prompt: string): Promise<string> {
    return `Verified response based on: ${prompt.slice(0, 100)}...`;
  }
}

export const deterministicAIProvider = new DeterministicAIProvider();
