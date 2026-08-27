import { AIProvider } from "./providers/ai.provider";
import { geminiAIProvider } from "./providers/gemini.provider";
import { deterministicAIProvider } from "./providers/deterministic.provider";
import { intentClassifier, IntentClassifier } from "./classifier/intent.classifier";
import { toolExecutor, ToolExecutor } from "./tools/tool.executor";
import { ItineraryService } from "./itinerary/itinerary.service";
import { OrchestratorResponseDto, ExtractedEntities } from "../../types/ai";
import { AuthenticatedUser } from "../../types/auth";
import { BadRequestError } from "../../utils/appError";
import { logger } from "../../lib/logger";
import { env } from "../../config/env";
import {
  travellerContextBuilder,
  TravellerContextBuilder
} from "./context/travellerContext.builder";
import { constraintEngine, ConstraintEngine } from "./context/constraint.engine";
import { locationResolver, LocationResolver } from "./context/location.resolver";
import { LocationResolution } from "../../types/travellerContext";
import {
  multiDestinationSelector,
  MultiDestinationSelector
} from "./planning/multiDestination.selector";
import {
  multiDestinationPlanner,
  MultiDestinationPlanner
} from "./planning/multiDestination.planner";
import { AdaptiveItineraryService, adaptiveItineraryService } from "./planning/adaptation.service";
import { MultiDestinationPlanDto } from "../../types/multiDestination";
import { CrossGapValidator, crossGapValidator } from "./validation/crossGapValidator";

/** Detects an explicit preference-save request (Phase 8B Scenario F). */
const EXPLICIT_SAVE_PATTERN =
  /(remember|save)\s+(that\s+)?i\s+prefer|remember my preference|save my (preference|preferences)/i;
/** Detects references to an existing saved trip. */
const EXISTING_TRIP_PATTERN =
  /(my|the|an)\s+(existing|current|saved)\s+(trip|itinerary)|improve my (trip|itinerary)|update my (trip|itinerary)|help me (with|improve|update) my (trip|itinerary)/i;
const TRIP_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export class OrchestratorService {
  private readonly itinService: ItineraryService;

  constructor(
    private readonly provider: AIProvider = env.GEMINI_API_KEY
      ? geminiAIProvider
      : deterministicAIProvider,
    private readonly fallbackProvider: AIProvider = deterministicAIProvider,
    private readonly classifier: IntentClassifier = intentClassifier,
    private readonly executor: ToolExecutor = toolExecutor,
    itinService?: ItineraryService,
    private readonly contextBuilder: TravellerContextBuilder = travellerContextBuilder,
    private readonly constraints: ConstraintEngine = constraintEngine,
    private readonly resolver: LocationResolver = locationResolver,
    private readonly selector: MultiDestinationSelector = multiDestinationSelector,
    private readonly planner: MultiDestinationPlanner = multiDestinationPlanner,
    private readonly adaptive: AdaptiveItineraryService = adaptiveItineraryService,
    private readonly crossValidator: CrossGapValidator = crossGapValidator
  ) {
    this.itinService = itinService || new ItineraryService(this.provider);
  }

  /**
   * Master orchestrator pipeline coordinating user requests, tool execution, and grounded AI synthesis.
   */
  async chat(
    message: string,
    user?: AuthenticatedUser,
    options?: { selectedDestinationIds?: string[] }
  ): Promise<OrchestratorResponseDto> {
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      throw new BadRequestError("Chat message cannot be empty");
    }

    if (message.length > 2000) {
      throw new BadRequestError("Message exceeds maximum allowed length of 2000 characters");
    }

    const startTime = Date.now();
    const cleanMessage = message.trim();

    // 1. Intent Classification & Entity Extraction
    const classification = this.classifier.classify(cleanMessage);
    logger.debug(
      { intent: classification.intent, entities: classification.entities },
      "Classified user intent"
    );

    // 2. Phase 8A/8B — Location resolution, Unified Traveller Context & Constraints
    //    Request-time derived objects; NEVER persisted automatically.
    const lowerMessage = cleanMessage.toLowerCase();

    // 8B: state/district/destination resolution (deterministic; ambiguity preserved)
    let locationResolution: LocationResolution | null = null;
    if (classification.entities.destinationName) {
      locationResolution = await this.resolver.resolve(classification.entities.destinationName);
    }

    // 8B: trip-context relevance — only for authenticated users referencing
    // an existing trip (explicit UUID or clear "my existing trip" phrasing)
    const referencedTripId = user ? (cleanMessage.match(TRIP_UUID_PATTERN)?.[0] ?? null) : null;
    const referencesExistingTrip =
      Boolean(user) && (Boolean(referencedTripId) || EXISTING_TRIP_PATTERN.test(lowerMessage));

    // 8B: explicit preference-save requests are the ONLY conversation path
    // that persists anything. Normal chat NEVER writes preferences.
    let persistenceNotice: string | null = null;
    if (EXPLICIT_SAVE_PATTERN.test(lowerMessage)) {
      if (!user) {
        persistenceNotice =
          "Sign in is required to save preferences. This request was processed without saving.";
      } else if ((classification.entities.interests?.length ?? 0) > 0) {
        try {
          const merged = await this.contextBuilder.persistExplicitInterests(
            user.id,
            classification.entities.interests!
          );
          persistenceNotice = `Preference saved at your explicit request. Stored interests now include: ${merged.join(", ")}.`;
        } catch {
          persistenceNotice = "Your preference could not be saved right now. Nothing was changed.";
        }
      } else {
        persistenceNotice = "No recognizable preference was found to save. Nothing was stored.";
      }
    }

    const travellerContext = await this.contextBuilder.buildContext({
      entities: classification.entities,
      intent: classification.intent,
      user,
      tripId: referencedTripId,
      includeRecentTrip: referencesExistingTrip && !referencedTripId
    });
    const constraintResolution = this.constraints.resolveConstraints(travellerContext);
    this.constraints.detectConflicts(constraintResolution.constraints);

    // Effective entities: request values win, stored preferences fill gaps.
    // 8B: a STATE/DISTRICT-level location must not silently become one city —
    // destination-specific tool resolution is suppressed and candidates are disclosed.
    const effectiveEntities = this.constraints.deriveEffectiveEntities(
      classification.entities,
      travellerContext
    );
    if (
      locationResolution &&
      (locationResolution.locationType === "state" ||
        locationResolution.locationType === "district") &&
      (classification.intent === "trip_planning" || classification.intent === "itinerary_help")
    ) {
      delete effectiveEntities.destinationName;
      delete effectiveEntities.destinationId;
    }
    logger.debug(
      {
        known: travellerContext.knownUserData,
        unknown: travellerContext.unknownUserData,
        hardConstraints: constraintResolution.hardConstraints.map((c) => c.id),
        locationType: locationResolution?.locationType ?? "none"
      },
      "Unified traveller context resolved"
    );

    // 2b. Phase 8C — Multi-Destination Orchestration for state/district scopes
    //     and explicit multi-destination free-text requests.
    const triggers = this.adaptive.parseTriggers(cleanMessage);
    const isTripIntent =
      classification.intent === "trip_planning" || classification.intent === "itinerary_help";
    const isRegionalScope =
      locationResolution &&
      (locationResolution.locationType === "state" ||
        locationResolution.locationType === "district");

    let effectiveResolution = locationResolution;
    let freeTextSelectionIds: string[] | undefined;
    if (isTripIntent && (!isRegionalScope || options?.selectedDestinationIds?.length)) {
      // Scenario B: detect multiple exact destinations named in free text.
      // Exact verified matches count as explicit user selection.
      const multi = await this.resolveMultipleDestinationNames(cleanMessage);
      if (multi.candidateDestinations.length >= 2) {
        effectiveResolution = multi;
        freeTextSelectionIds = multi.candidateDestinations.map((c) => c.id);
      }
    }

    if (
      isTripIntent &&
      effectiveResolution &&
      (effectiveResolution.locationType === "state" ||
        effectiveResolution.locationType === "district" ||
        (effectiveResolution.locationType === "destination" &&
          effectiveResolution.candidateDestinations.length >= 2))
    ) {
      const explicitIds = this.validateRequestedIds(
        options?.selectedDestinationIds?.length
          ? options.selectedDestinationIds
          : freeTextSelectionIds
      );
      for (const id of explicitIds.rejected) {
        // surfaced below via plan warnings / immediate response warnings
        void id;
      }
      const selection = await this.selector.select({
        locationResolution: effectiveResolution,
        travellerContext,
        requestedDuration: classification.entities.days ?? 2,
        explicitDestinationIds: explicitIds.valid.length > 0 ? explicitIds.valid : undefined
      });

      if (selection.mode === "awaiting_confirmation" || selection.selected.length === 0) {
        return this.buildConfirmationResponse({
          cleanMessage,
          classification,
          travellerContext,
          constraintResolution,
          resolution: effectiveResolution,
          selectionWarnings: selection.warnings,
          sources: contextSourcesPlaceholder()
        });
      }

      const plan = await this.planner.plan({
        locationResolution: effectiveResolution,
        selectedDestinations: selection.selected,
        mode: selection.mode,
        travellerContext,
        constraintResolution,
        entities: { ...effectiveEntities, days: classification.entities.days ?? 2 },
        user
      });
      if (explicitIds.rejected.length > 0) {
        plan.warnings.push(
          `Rejected destination ID(s) outside the resolved context: ${explicitIds.rejected.join(", ")}.`
        );
      }
      if (persistenceNotice) {
        plan.warnings.push(persistenceNotice);
      }

      // Phase 8D composition — adapt the generated plan when adaptation
      // triggers coexist with the planning request (assess + suggest only).
      let adaptation: OrchestratorResponseDto["adaptation"] = null;
      let overrideCtxForSummary = travellerContext;
      let overrideConstraintsForSummary = constraintResolution;
      if (triggers.isAdaptationQuery) {
        const snapshot = await this.adaptive.buildSnapshotFromPlan(plan);
        const [oCtx, oEnt] = this.applyTriggerOverrides(
          travellerContext,
          { ...effectiveEntities, days: classification.entities.days ?? 2 },
          cleanMessage,
          triggers
        );
        const oRes = this.constraints.resolveConstraints(oCtx);
        overrideCtxForSummary = oCtx;
        overrideConstraintsForSummary = oRes;
        adaptation = await this.adaptive.adapt({
          snapshot,
          entities: oEnt,
          travellerContext: oCtx,
          constraintResolution: oRes,
          triggers
        });
      }

      return {
        intent: classification.intent,
        summary: this.buildMultiDestinationSummary(plan),
        trip: {
          destination: `${plan.planningScope.name} (${plan.selectedDestinations.map((d) => d.name).join(" → ")})`,
          durationDays: plan.days.length || classification.entities.days || 2,
          travellerGroup: travellerContext.travellerProfile.travellerGroup.value ?? undefined,
          startDate: classification.entities.startDate
        },
        recommendations: plan.selectedDestinations.map((d) => ({
          title: d.name,
          description: d.selectionReason,
          category: "Multi-destination stop",
          highlights: [
            `Data quality: ${d.dataQuality.status}`,
            `Verified: ${d.dataQuality.verifiedAttractions} attraction(s), ${d.dataQuality.verifiedExperiences} experience(s)`
          ]
        })),
        days: plan.days as OrchestratorResponseDto["days"],
        itinerary: plan.days as OrchestratorResponseDto["itinerary"],
        warnings: [...plan.warnings, ...(adaptation?.warnings ?? [])],
        sources: [...plan.sources, ...(adaptation?.sources ?? [])],
        travellerContext: this.constraints.toSafeSummary(
          overrideCtxForSummary,
          overrideConstraintsForSummary
        ),
        locationResolution: effectiveResolution,
        multiDestinationPlan: plan,
        adaptation
      };
    }

    // 2c. Phase 8D — Real-Time Adaptive Itinerary (assess + suggest; never
    //     auto-persists). Trigger overrides are REQUEST-SCOPED ONLY.
    if (
      triggers.isAdaptationQuery &&
      isTripIntent &&
      effectiveResolution &&
      effectiveResolution.candidateDestinations.length >= 1
    ) {
      let snapshot = null as Awaited<ReturnType<AdaptiveItineraryService["buildSnapshotFromTrip"]>>;
      if (user && referencedTripId) {
        snapshot = await this.adaptive.buildSnapshotFromTrip(referencedTripId, user);
      }
      let adaptiveSources: OrchestratorResponseDto["sources"] = [];
      if (!snapshot) {
        const baseline = await this.adaptive.buildRequestScopedSnapshot(
          effectiveResolution.candidateDestinations[0].name,
          { ...effectiveEntities, days: classification.entities.days ?? 2 }
        );
        snapshot = baseline.snapshot;
        adaptiveSources = baseline.sources;
      }

      if (snapshot) {
        const [overrideCtx, overrideEntities] = this.applyTriggerOverrides(
          travellerContext,
          effectiveEntities,
          cleanMessage,
          triggers
        );
        const overrideConstraints = this.constraints.resolveConstraints(overrideCtx);
        const adaptation = await this.adaptive.adapt({
          snapshot,
          entities: overrideEntities,
          travellerContext: overrideCtx,
          constraintResolution: overrideConstraints,
          triggers,
          mode: triggers.wantsApply ? "suggest_adjustments" : "suggest_adjustments"
        });

        // Apply path — ONLY with explicit confirmation AND an owned saved trip
        if (triggers.wantsApply && adaptation.proposedChanges.length > 0) {
          if (user && snapshot.tripId) {
            const applied = await this.adaptive.applyToTrip(
              snapshot.tripId,
              user,
              adaptation.proposedChanges
            );
            adaptation.adaptationMode =
              applied.appliedCount > 0 ? "apply_adjustment" : "suggest_adjustments";
            adaptation.warnings.push(
              `${applied.appliedCount} confirmed change(s) were persisted to your saved trip via the existing authorized update path.` +
                (applied.warnings.length ? " " + applied.warnings.join(" ") : "")
            );
          } else if (!user) {
            adaptation.warnings.push(
              "Sign in with the trip owner account to apply changes. Nothing was modified."
            );
          } else {
            adaptation.warnings.push(
              "No saved trip was identified for this conversation — suggestions were generated without persisting anything."
            );
          }
        }

        return {
          intent: classification.intent,
          summary:
            adaptation.changesDetected.length === 0
              ? "No relevant verified condition changes affect your current itinerary."
              : `${adaptation.changesDetected.length} relevant change(s) detected (${Array.from(new Set(adaptation.changesDetected.map((c) => c.type))).join(", ")}); ${adaptation.proposedChanges.length} minimal-change adjustment(s) proposed based on evaluated verified alternatives.`,
          recommendations: adaptation.proposedChanges.map((p) => ({
            title:
              p.action === "replace_item"
                ? `Replace ${p.affectedPlaceName} → ${p.replacementPlaceName}`
                : p.action === "reschedule_item"
                  ? `Reschedule ${p.affectedPlaceName}`
                  : `Remove ${p.affectedPlaceName}`,
            description: p.reason,
            category: `Tier ${p.minimizationTier} adjustment`,
            highlights: [`Day ${p.day}`, ...p.preservedConstraints.slice(0, 3)]
          })),
          days: [],
          itinerary: [],
          warnings: [...adaptation.warnings],
          sources: [...adaptiveSources, ...adaptation.sources],
          travellerContext: this.constraints.toSafeSummary(overrideCtx, overrideConstraints),
          locationResolution: effectiveResolution,
          adaptation
        };
      }
    }

    // 3. Add authenticated user tools if applicable
    const toolsToExecute = [...classification.requiredTools];
    if (user && classification.intent === "trip_planning") {
      toolsToExecute.push("user_preferences");
    }

    // 4. Tool Execution Engine (with effective normalized entities)
    const context = await this.executor.executeTools(toolsToExecute, effectiveEntities, user);

    // 5. Specialized Itinerary Generation for Trip Planning
    if (classification.intent === "trip_planning" || classification.intent === "itinerary_help") {
      const itinResponse = await this.itinService.generateItinerary(
        cleanMessage,
        effectiveEntities,
        context,
        constraintResolution,
        this.constraints.toSafeSummary(travellerContext, constraintResolution)
      );
      if (locationResolution) {
        itinResponse.locationResolution = locationResolution;
        itinResponse.warnings = [...(itinResponse.warnings || []), ...locationResolution.warnings];
      }
      if (persistenceNotice) {
        itinResponse.warnings = [...(itinResponse.warnings || []), persistenceNotice];
      }
      const sanitizedItin = this.crossValidator.sanitizeResponse(itinResponse, {
        travellerContext,
        user
      });
      const durationMs = Date.now() - startTime;
      logger.info(
        {
          intent: sanitizedItin.intent,
          daysCount: sanitizedItin.days?.length,
          sourcesCount: sanitizedItin.sources.length,
          durationMs
        },
        "Orchestrator completed itinerary request"
      );
      return sanitizedItin;
    }

    // 5. Grounded Synthesis for Informational / Safety / Weather / Crowd / Query Intents
    const isInfoIntent =
      classification.intent === "destination_information" ||
      classification.intent === "destination_search" ||
      classification.intent === "general_tourism_query";
    const systemInstruction = `You are the SIH Smart Tourism AI Orchestrator for India.
Your mission is to synthesize verified, grounded, and helpful tourism guidance based STRICTLY on the verified context provided below.
CRITICAL RULES:
1. Grounded Reasoning: Never fabricate attraction names, weather metrics, crowd values, or safety facts not present in the verified context.
2. Strict Destination-Child Association: Any child attraction or experience mentioned MUST be present in the verified context for this exact destination. Never attach places from other destinations, nearby cities, or statewide pools.
3. Information vs Planning: For destination_information and informational queries, do NOT generate day-by-day itineraries, morning/afternoon schedules, or time blocks. Output MUST have "days": [] and "itinerary": []. Prioritize factual destination details, state, categories, and verified attractions.
4. Zero-Child Data Behavior: If verified attractions and experiences are empty in the context, state honestly that the verified database has limited attraction/experience records specifically linked to this destination. Never invent places.
5. Safety Language: Use "verified tourism guide" instead of "safe tourism guide". When safety data is limited, state "Destination-specific safety information is limited." Never claim a destination is completely safe or crime-free.
6. Output MUST be valid JSON adhering to the OrchestratorResponseDto structure.`;

    const prompt = `User Query: "${cleanMessage}"
Intent: "${classification.intent}"

Verified Context Data:
\`\`\`json
${JSON.stringify(
  {
    intent: classification.intent,
    entities: classification.entities,
    destination: context.destination || null,
    attractions: context.attractions || [],
    experiences: context.experiences || [],
    accessibility: context.accessibility || null,
    accessibility_assessment: context.accessibility_assessment || null,
    elderly_support: context.elderly_support || null,
    elderly_assessment: context.elderly_assessment || null,
    budget_assessment: context.budget_assessment || null,
    experience_assessment: context.experience_assessment || null,
    gallery: context.gallery || null,
    multilingual_content: context.multilingual_content || null,
    content_summary: context.content_summary || null,
    businesses: context.businesses || null,
    sustainability: context.sustainability || null,
    crowd: context.crowd || null,
    safety: context.safety || null,
    women_safety: context.women_safety || null,
    emergency_resources: context.emergency_resources || [],
    local_businesses: context.local_businesses || [],
    weather: context.weather || null,
    routing: context.routing || null,
    user_preferences: context.user_preferences || null,
    sources: context.sources
  },
  null,
  2
)}
\`\`\`

UNIFIED TRAVELLER CONTEXT (sanitized — requirements, constraints, objectives only):
\`\`\`json
${JSON.stringify(this.constraints.toSafeSummary(travellerContext, constraintResolution), null, 2)}
\`\`\`

Generate a structured tourism response for this user query.`;

    let result: OrchestratorResponseDto;
    try {
      result = await this.provider.generateStructuredResponse<OrchestratorResponseDto>(
        prompt,
        systemInstruction
      );
    } catch (err) {
      logger.warn(
        { err, provider: this.provider.providerName },
        "Primary AI provider call failed; executing grounded deterministic fallback"
      );
      result = await this.fallbackProvider.generateStructuredResponse<OrchestratorResponseDto>(
        prompt,
        systemInstruction
      );
    }

    // 6. Guarantee Source Provenance, Crowd Context, Assessments, and Intent Consistency
    result.sources = context.sources;
    result.travellerContext = this.constraints.toSafeSummary(
      travellerContext,
      constraintResolution
    );
    if (locationResolution) {
      result.locationResolution = locationResolution;
      result.warnings = [...(result.warnings || []), ...locationResolution.warnings];
    }
    if (persistenceNotice) {
      result.warnings = [...(result.warnings || []), persistenceNotice];
    }
    if (!result.intent) {
      result.intent = classification.intent;
    }
    if (isInfoIntent) {
      result.days = [];
      result.itinerary = [];
    }
    if (result.summary && result.summary.includes("safe tourism guide")) {
      result.summary = result.summary.replace(/safe tourism guide/gi, "verified tourism guide");
    }
    if (persistenceNotice) {
      result.warnings = [...(result.warnings || []), persistenceNotice];
    }
    if (!result.intent) {
      result.intent = classification.intent;
    }
    if (context.crowd && !result.crowd) {
      result.crowd = context.crowd;
    }
    if (context.women_safety && !result.womenSafety) {
      result.womenSafety = context.women_safety;
    }
    if (context.accessibility_assessment && !result.accessibilityAssessment) {
      result.accessibilityAssessment = context.accessibility_assessment;
    }
    if (context.elderly_assessment && !result.elderlyAssessment) {
      result.elderlyAssessment = context.elderly_assessment;
    }
    if (context.budget_assessment && !result.budgetAssessment) {
      result.budgetAssessment = context.budget_assessment;
    }
    if (context.experience_assessment && !result.experienceAssessment) {
      result.experienceAssessment = context.experience_assessment;
    }
    if (context.gallery && !result.gallery) {
      result.gallery = context.gallery;
    }
    if (context.multilingual_content && !result.multilingualContent) {
      result.multilingualContent = context.multilingual_content;
    }
    if (context.content_summary && !result.contentSummary) {
      result.contentSummary = context.content_summary;
    }
    if (context.businesses && !result.businesses) {
      result.businesses = context.businesses;
    }
    if (context.sustainability && !result.sustainability) {
      result.sustainability = context.sustainability;
    }

    const durationMs = Date.now() - startTime;
    logger.info(
      { intent: result.intent, sourcesCount: result.sources.length, durationMs },
      "Orchestrator completed query request"
    );

    // Phase 8E — Final deterministic validation gate before client return
    return this.crossValidator.sanitizeResponse(result, {
      travellerContext,
      user
    });
  }

  // -------------------------------------------------------------------------
  // Phase 8C helpers
  // -------------------------------------------------------------------------

  /**
   * Phase 8D — applies trigger overrides to a REQUEST-SCOPED context copy.
   * Never persists (Phase 8B rules): only "Remember that…" phrasing persists.
   */
  private applyTriggerOverrides(
    ctx: Awaited<ReturnType<TravellerContextBuilder["buildContext"]>>,
    entities: ExtractedEntities,
    message: string,
    triggers: ReturnType<AdaptiveItineraryService["parseTriggers"]>
  ): [Awaited<ReturnType<TravellerContextBuilder["buildContext"]>>, ExtractedEntities] {
    const overrideCtx: typeof ctx = JSON.parse(JSON.stringify(ctx));
    const overrideEntities: ExtractedEntities = { ...entities };

    for (const trigger of triggers.userConstraintTriggers) {
      if (trigger.type === "accessibility") {
        overrideCtx.travellerProfile.accessibilityNeeds = {
          value: Array.from(
            new Set([...overrideCtx.travellerProfile.accessibilityNeeds.value, "wheelchair"])
          ),
          source: "explicit_request",
          confidence: "high"
        };
        overrideEntities.requiresWheelchair = true;
      } else if (trigger.type === "budget") {
        const m = message.match(/budget[^₹\d]*₹?\s*([\d,]+)\s*(k|thousand)?/i);
        if (m?.[1]) {
          let amount = parseFloat(m[1].replace(/,/g, ""));
          if (/k|thousand/i.test(m[2] ?? "")) amount *= 1000;
          if (!isNaN(amount) && amount > 0) {
            overrideCtx.budget.amount = {
              value: amount,
              source: "explicit_request",
              confidence: "high"
            };
            overrideCtx.budget.priority = {
              value: "hard_limit",
              source: "explicit_request",
              confidence: "high"
            };
            overrideEntities.userBudget = amount;
            overrideEntities.isBudgetConstrained = true;
          }
        }
      } else if (trigger.reason.includes("crowd avoidance")) {
        overrideCtx.preferences.avoidCrowds = {
          value: true,
          source: "explicit_request",
          confidence: "high"
        };
        overrideEntities.avoidCrowds = true;
      } else if (trigger.reason.toLowerCase().includes("sustainability")) {
        overrideCtx.preferences.preferEco = {
          value: true,
          source: "explicit_request",
          confidence: "high"
        };
        overrideEntities.ecoFriendlyPreference = true;
      }
    }
    return [overrideCtx, overrideEntities];
  }

  /** Validates caller-supplied destination IDs (UUID format only). */
  private validateRequestedIds(ids?: string[]): { valid: string[]; rejected: string[] } {
    const valid: string[] = [];
    const rejected: string[] = [];
    for (const id of ids ?? []) {
      if (
        typeof id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      ) {
        valid.push(id);
      } else {
        rejected.push(String(id));
      }
    }
    return { valid, rejected };
  }

  /**
   * Scenario B — detects multiple exact destination names in free text
   * ("Fort Kochi and Marari Beach"). Only EXACT verified matches count;
   * bounded to 3 destinations; never guesses from partial similarity.
   */
  private async resolveMultipleDestinationNames(message: string): Promise<LocationResolution> {
    // Capitalized noun-phrase scan: robust against prefixes like
    // "Plan 3 days covering X and Y." — only exact verified matches count.
    const STOP_PHRASES = new Set([
      "plan",
      "trip",
      "itinerary",
      "cover",
      "covering",
      "include",
      "including",
      "visit",
      "visiting",
      "the",
      "and",
      "my",
      "for",
      "in",
      "at",
      "to"
    ]);
    const rawPhrases = message.match(/[A-Z][a-zA-Z']*(?:\s+(?:de|of|the|[A-Z][a-zA-Z']*))*/g) ?? [];
    const phrases = Array.from(
      new Set(
        rawPhrases
          .map((p) => p.trim())
          .filter((p) => p.length >= 3 && !STOP_PHRASES.has(p.toLowerCase()))
      )
    ).slice(0, 4);

    const candidates: LocationResolution["candidateDestinations"] = [];
    const seen = new Set<string>();
    let state: string | null = null;

    for (const phrase of phrases) {
      if (candidates.length >= 3) break;
      const match = await this.resolver.resolve(phrase).catch(() => null);
      if (
        match &&
        (match.locationType === "destination" || match.locationType === "ambiguous") &&
        match.candidateDestinations.length >= 1
      ) {
        const c =
          match.candidateDestinations.find((c) => c.name.toLowerCase() === phrase.toLowerCase()) ??
          (match.candidateDestinations.length === 1 ? match.candidateDestinations[0] : undefined);
        if (c && !seen.has(c.id)) {
          seen.add(c.id);
          candidates.push(c);
          if (!state) state = c.state;
          else if (state !== c.state) state = null; // cross-state selection stays multi_destination
        }
      }
    }

    return {
      locationType: candidates.length >= 2 ? "destination" : "unknown",
      query: candidates.map((c) => c.name).join(" + ") || message,
      resolvedState: state,
      resolvedDistrict: null,
      candidateDestinations: candidates,
      totalCandidates: candidates.length,
      confidence: candidates.length >= 2 ? "high" : "low",
      warnings: []
    };
  }

  /** Transparent confirmation response when auto-selection is not safe. */
  private buildConfirmationResponse(input: {
    cleanMessage: string;
    classification: { intent: OrchestratorResponseDto["intent"]; entities: ExtractedEntities };
    travellerContext: Awaited<ReturnType<TravellerContextBuilder["buildContext"]>>;
    constraintResolution: ReturnType<ConstraintEngine["resolveConstraints"]>;
    resolution: LocationResolution;
    selectionWarnings: string[];
    sources: OrchestratorResponseDto["sources"];
  }): OrchestratorResponseDto {
    const shortlist = input.resolution.candidateDestinations;
    const names = shortlist.slice(0, 6).map((c) => c.name);
    void input.cleanMessage;
    return {
      intent: input.classification.intent,
      summary: `${input.resolution.query} has ${shortlist.length} verified candidate destination(s): ${names.join(", ")}${shortlist.length > 6 ? ", …" : ""}. Choose the destinations you want included by replying with their IDs via selectedDestinationIds.`,
      recommendations: shortlist.map((c) => ({
        title: c.name,
        description: `Verified candidate in ${c.district ?? c.state}`,
        category: "Candidate destination",
        highlights: [`ID: ${c.id}`, `State: ${c.state}`]
      })),
      days: [],
      itinerary: [],
      warnings: [
        ...input.selectionWarnings,
        ...input.resolution.warnings,
        "No itinerary was generated because destination selection is required. No attractions were fabricated."
      ],
      sources: [{ type: "database", provider: "Supabase", resource: "destinations" }],
      travellerContext: this.constraints.toSafeSummary(
        input.travellerContext,
        input.constraintResolution
      ),
      locationResolution: input.resolution,
      multiDestinationPlan: {
        planningScope: {
          type: input.resolution.locationType === "district" ? "district" : ("state" as const),
          name: input.resolution.query
        },
        mode: "awaiting_confirmation",
        candidateShortlist: shortlist.map((c) => ({
          id: c.id,
          name: c.name,
          district: c.district,
          state: c.state
        })),
        selectedDestinations: [],
        interCityTravel: [],
        knownTravelBurden: {
          totalKnownDistanceKm: null,
          totalKnownDurationMinutes: null,
          routingCallsUsed: 0,
          routingCallLimit: DEFAULT_MAX_ROUTING_CALLS_EXPORT,
          note: "Routing has not been evaluated yet — awaiting destination confirmation."
        },
        dayAllocation: [],
        days: [],
        crossDestinationInsights: EMPTY_INSIGHTS(),
        warnings: [...input.selectionWarnings, ...input.resolution.warnings],
        sources: [{ type: "database", provider: "Supabase", resource: "destinations" }]
      }
    };
  }

  private buildMultiDestinationSummary(
    plan: NonNullable<OrchestratorResponseDto["multiDestinationPlan"]>
  ): string {
    const destNames = plan.selectedDestinations.map((d) => d.name).join(" → ");
    const mode =
      plan.mode === "confirmed"
        ? "using your explicitly confirmed destinations"
        : "using a deterministic bounded automatic selection";
    const travel =
      plan.knownTravelBurden.totalKnownDistanceKm != null
        ? ` Verified inter-city travel: ${plan.knownTravelBurden.totalKnownDistanceKm} km.`
        : " Inter-city travel data is unavailable and was not estimated.";
    return `Multi-destination plan for ${plan.planningScope.name} ${mode}: ${destNames}. ${travel} All activities come strictly from verified database records.`;
  }
}

const DEFAULT_MAX_ROUTING_CALLS_EXPORT = 6;
function contextSourcesPlaceholder(): OrchestratorResponseDto["sources"] {
  return [{ type: "database", provider: "Supabase", resource: "destinations" }];
}
function EMPTY_INSIGHTS(): MultiDestinationPlanDto["crossDestinationInsights"] {
  return {
    weather: [],
    crowd: [],
    womenSafety: [],
    accessibility: [],
    budget: {
      currency: "INR",
      perDestinationKnownSubtotals: [],
      knownTripSubtotal: 0,
      unknownCategories: ["accommodation", "food", "transport"],
      budgetStatus: "unknown",
      userBudget: null,
      disclaimer:
        "Only verified entry fees are aggregated. Accommodation, food, and transport remain UNKNOWN."
    },
    sustainability: []
  };
}

export const orchestratorService = new OrchestratorService();
