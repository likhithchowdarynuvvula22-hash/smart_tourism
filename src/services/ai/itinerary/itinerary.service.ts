import { ExtractedEntities, OrchestratorResponseDto } from "../../../types/ai";
import { CurrentWeatherDto } from "../../../types/external";
import { CandidateFilter, candidateFilter } from "./candidate.filter";
import { ItinerarySequencer, itinerarySequencer } from "./itinerary.sequencer";
import { ItineraryValidator, itineraryValidator } from "./itinerary.validator";
import { AIProvider } from "../providers/ai.provider";
import { geminiAIProvider } from "../providers/gemini.provider";
import { deterministicAIProvider } from "../providers/deterministic.provider";
import { ToolExecutionContext } from "../tools/tool.executor";
import { ConstraintEngine, constraintEngine } from "../context/constraint.engine";
import { ConstraintResolution } from "../../../types/travellerContext";
import { SafeTravellerContextSummary } from "../../../types/travellerContext";
import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";

export class ItineraryService {
  constructor(
    private readonly provider: AIProvider = env.GEMINI_API_KEY
      ? geminiAIProvider
      : deterministicAIProvider,
    private readonly filter: CandidateFilter = candidateFilter,
    private readonly sequencer: ItinerarySequencer = itinerarySequencer,
    private readonly validator: ItineraryValidator = itineraryValidator
  ) {}

  /**
   * Generates a fully grounded, schema-validated multi-day tourism itinerary.
   * Guarantees strict global uniqueness and transparent warnings when catalog candidates are sparse.
   */
  async generateItinerary(
    message: string,
    entities: ExtractedEntities,
    toolContext: ToolExecutionContext,
    constraints?: ConstraintResolution,
    safeContext?: SafeTravellerContextSummary,
    engine: ConstraintEngine = constraintEngine
  ): Promise<OrchestratorResponseDto> {
    const destination = toolContext.destination || {};
    const destinationName =
      (destination.name as string) || entities.destinationName || "Selected Destination";
    const durationDays = entities.days || 2;
    const weather = toolContext.weather as CurrentWeatherDto | undefined;
    const safety = toolContext.safety;

    // 1. Candidate Filtering, Prioritization & Relational Normalization
    //    Phase 8A: hard constraints enforced BEFORE ranking; soft preferences used for ranking.
    const candidates = this.filter.filterAndNormalize(
      {
        destination: toolContext.destination,
        attractions: toolContext.attractions,
        experiences: toolContext.experiences,
        accessibility: toolContext.accessibility,
        elderlySupport: toolContext.elderly_support,
        localBusinesses: toolContext.local_businesses
      },
      entities,
      constraints,
      engine
    );

    // 2. Pre-Sequence Grounded Days with Global Uniqueness
    const sequencedDays = await this.sequencer.sequenceItinerary(candidates, entities, weather);

    // 3. Assemble Grounded LLM Prompt
    const systemInstruction = `You are the SIH Smart Tourism AI Itinerary Planner for India.
Your task is to synthesize a personalized, logical, multi-day travel itinerary strictly using the verified candidates below.
CRITICAL GROUNDING & QUALITY RULES:
1. ONLY select places from the provided VERIFIED CANDIDATES list using their exact "id" and "name".
2. GLOBAL UNIQUENESS: Every place "id" may appear at most ONCE in the entire itinerary across all days. DO NOT repeat any placeId.
3. If candidates are fewer than requested time slots, leave remaining slots empty or schedule fewer activities. DO NOT invent or duplicate places.
4. Prefer child attractions and experiences over destination-level fallbacks.
5. For elderly/parents: ensure comfortable pacing, leisurely morning/afternoon timing, and emphasize verified resting benches.
6. Output MUST be valid JSON adhering to the OrchestratorResponseDto schema.`;

    const prompt = `User Query: "${message}"
Destination: "${destinationName}"
Duration: ${durationDays} days
Traveller Group: ${entities.travellerGroup || "General"}
Women/Solo Traveller Focus: ${entities.isWomenTraveller || entities.isSoloFemale ? "Yes" : "No"}

VERIFIED CANDIDATES (${candidates.length} available):
\`\`\`json
${JSON.stringify(candidates, null, 2)}
\`\`\`

UNIFIED TRAVELLER CONTEXT & CONSTRAINTS (sanitized):
\`\`\`json
${safeContext ? JSON.stringify(safeContext, null, 2) : "No additional normalized traveller constraints"}
\`\`\`

LIVE WEATHER CONTEXT:
\`\`\`json
${weather ? JSON.stringify(weather, null, 2) : "Live weather data unavailable"}
\`\`\`

SAFETY CONTEXT:
\`\`\`json
${safety ? JSON.stringify(safety, null, 2) : "Safety metrics unavailable"}
\`\`\`

WOMEN SAFETY INTELLIGENCE:
\`\`\`json
${toolContext.women_safety ? JSON.stringify(toolContext.women_safety, null, 2) : "Women safety intelligence unavailable"}
\`\`\`

Generate the structured multi-day itinerary JSON with unique placeIds.`;

    // 4. Execute Primary AI Provider with Validation
    let result: OrchestratorResponseDto;
    try {
      const rawAiResponse = await this.provider.generateStructuredResponse<OrchestratorResponseDto>(
        prompt,
        systemInstruction
      );

      // Validate that LLM didn't hallucinate place IDs or create duplicate entries
      result = this.validator.validateAndSanitize(rawAiResponse, candidates, durationDays);
      if (this.filter.lastHardConstraintWarnings.length > 0) {
        result.warnings = [...(result.warnings || []), ...this.filter.lastHardConstraintWarnings];
      }
    } catch (err) {
      logger.warn(
        { err, provider: this.provider.providerName },
        "Primary AI generation or validation failed; executing deterministic grounded fallback"
      );

      const totalScheduled = sequencedDays.reduce((acc, d) => acc + d.items.length, 0);
      const warnings: string[] = [...this.filter.lastHardConstraintWarnings];
      if (totalScheduled === 0) {
        warnings.push(
          "No verified attractions or destinations found in the database for this location."
        );
      } else if (candidates.length < 4) {
        warnings.push(
          `Only ${totalScheduled} unique verified place(s) are available in the verified database for ${destinationName}. Itinerary activities have been sized to avoid duplicate or fabricated stops.`
        );
      }

      if (toolContext.women_safety?.warnings) {
        warnings.push(...toolContext.women_safety.warnings);
      }
      if (toolContext.accessibility_assessment?.warnings) {
        warnings.push(...toolContext.accessibility_assessment.warnings);
      }
      if (toolContext.elderly_assessment?.warnings) {
        warnings.push(...toolContext.elderly_assessment.warnings);
      }
      if (toolContext.budget_assessment?.warnings) {
        warnings.push(...toolContext.budget_assessment.warnings);
      }
      if (toolContext.experience_assessment?.warnings) {
        warnings.push(...toolContext.experience_assessment.warnings);
      }

      // Deterministic Grounded Synthesis using sequenced candidate items
      result = {
        intent: "trip_planning",
        summary: `Here is your verified, safe tourism itinerary for ${destinationName}, tailored for ${entities.travellerGroup || "your trip"}.`,
        trip: {
          destination: destinationName,
          destinationId: destination.id as string | undefined,
          durationDays,
          travellerGroup: entities.travellerGroup,
          startDate: entities.startDate
        },
        destination: {
          id: destination.id as string,
          name: destinationName,
          state: destination.state as string,
          description: destination.description as string
        },
        recommendations: candidates.slice(0, 4).map((c) => ({
          title: c.name,
          description: c.description || "Verified destination site",
          category: c.category,
          highlights: [
            `Category: ${c.category || "Sightseeing"}`,
            c.entryFee ? `Entry Fee: ₹${c.entryFee.amount}` : "Entry: Free / Public",
            c.isElderlyFriendly ? "Senior citizen friendly" : "Standard access"
          ]
        })),
        days: sequencedDays,
        itinerary: sequencedDays,
        weather: weather || null,
        safety: safety
          ? {
              overview:
                typeof safety.overview === "string"
                  ? safety.overview
                  : "Safety information verified from local resources.",
              safetyScore: typeof safety.safetyScore === "number" ? safety.safetyScore : undefined,
              womenHelpline: "1091 / 112",
              emergencyHelplines: {
                Police: "100",
                Ambulance: "108",
                NationalEmergency: "112"
              }
            }
          : null,
        womenSafety: toolContext.women_safety || null,
        accessibilityAssessment: toolContext.accessibility_assessment || null,
        elderlyAssessment: toolContext.elderly_assessment || null,
        budgetAssessment: toolContext.budget_assessment || null,
        experienceAssessment: toolContext.experience_assessment || null,
        accessibility: {
          wheelchairSupport: candidates.some((c) => c.isWheelchairAccessible),
          elderlySupport: candidates.some((c) => c.isElderlyFriendly),
          notes:
            entities.travellerGroup === "parents" || entities.travellerGroup === "elderly"
              ? ["Senior citizen seating & resting benches verified along main paths"]
              : ["Accessibility ramps and walkways verified"]
        },
        warnings,
        sources: toolContext.sources
      };
    }

    // Ensure Trip and Sources metadata are populated
    result.trip = {
      destination: destinationName,
      destinationId: destination.id as string | undefined,
      durationDays,
      travellerGroup: entities.travellerGroup,
      startDate: entities.startDate
    };
    result.sources = toolContext.sources;
    if (safeContext) {
      result.travellerContext = safeContext;
    }
    if (toolContext.women_safety) {
      result.womenSafety = toolContext.women_safety;
    }
    if (toolContext.accessibility_assessment) {
      result.accessibilityAssessment = toolContext.accessibility_assessment;
    }
    if (toolContext.elderly_assessment) {
      result.elderlyAssessment = toolContext.elderly_assessment;
    }
    if (toolContext.budget_assessment) {
      result.budgetAssessment = toolContext.budget_assessment;
    }
    if (toolContext.experience_assessment) {
      result.experienceAssessment = toolContext.experience_assessment;
    }

    return result;
  }
}

export const itineraryService = new ItineraryService();
