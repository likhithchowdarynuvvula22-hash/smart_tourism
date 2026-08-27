import { CandidatePlace, ItineraryDayDto, OrchestratorResponseDto } from "../../../types/ai";

import { AuthenticatedUser } from "../../../types/auth";
import {
  BlockedItem,
  CrossGapConflict,
  CrossGapValidationResultDto,
  ModifiedItem,
  ResolvedItem,
  ValidationStatus
} from "../../../types/crossGapValidator";
import { MultiDestinationPlanDto } from "../../../types/multiDestination";
import { TravellerContext } from "../../../types/travellerContext";
import { DestinationRow } from "../../../types/database.types";
import { logger } from "../../../lib/logger";

export interface CrossGapValidationOptions {
  travellerContext: TravellerContext;
  user?: AuthenticatedUser;
  candidatePlaces?: CandidatePlace[];
  knownDestinations?: DestinationRow[];
  multiPlan?: MultiDestinationPlanDto | null;
  intelligenceContext?: {
    safetyAlerts?: Array<{ severity: string; title: string; destinationId: string }>;
    safetyIncidents?: Array<{ destinationId: string; description: string }>;
    accessibilityAssessments?: Record<
      string,
      { status: string; restingBenches?: boolean; walkingDifficulty?: string }
    >;
    budgetAssessments?: Record<string, { knownSubtotal: number; isComplete: boolean }>;
    crowdAssessments?: Record<string, { level: string; confidence: number }>;
    sustainabilityAssessments?: Record<string, { status: string; hasCarbon: boolean }>;
  };
}

export class CrossGapValidator {
  /**
   * Evaluates an itinerary, multi-destination plan, or set of recommendations
   * deterministically across all 10 priority layers.
   */
  validate(
    itinerary: ItineraryDayDto[] | undefined,
    options: CrossGapValidationOptions
  ): CrossGapValidationResultDto {
    const conflicts: CrossGapConflict[] = [];
    const blockedItems: BlockedItem[] = [];
    const modifiedItems: ModifiedItem[] = [];
    const warnings: string[] = [];
    const resolutions: ResolvedItem[] = [];
    const unknowns: string[] = [];

    const {
      travellerContext,
      user,
      candidatePlaces,
      knownDestinations,
      multiPlan,
      intelligenceContext
    } = options;

    const days = itinerary || [];
    const validPlaceMap = new Map<string, CandidatePlace>();
    if (candidatePlaces) {
      for (const cp of candidatePlaces) {
        validPlaceMap.set(cp.id, cp);
      }
    }

    const validDestMap = new Map<string, DestinationRow>();
    if (knownDestinations) {
      for (const d of knownDestinations) {
        validDestMap.set(d.id, d);
      }
    }

    // -----------------------------------------------------------------------
    // 1. Security & Ownership Validation
    // -----------------------------------------------------------------------
    if (travellerContext.activeTrip && user) {
      // If trip context belongs to another user, flag security violation
      if (
        travellerContext.identity.authenticated &&
        travellerContext.identity.userId &&
        travellerContext.identity.userId !== user.id
      ) {
        conflicts.push({
          code: "SECURITY_OWNERSHIP_VIOLATION",
          category: "security",
          severity: "critical",
          action: "REJECT",
          message: "Active trip context does not match the authenticated user identity.",
          userFacingExplanation: "You do not have permission to modify or access this trip."
        });
      }
    }

    // -----------------------------------------------------------------------
    // 2. Destination & Global Place Validity & Uniqueness
    // -----------------------------------------------------------------------
    const globallySeenPlaceIds = new Set<string>();
    const seenDestinationIds = new Set<string>();

    for (const day of days) {
      for (const item of day.items || []) {
        if (!item.placeId) continue;

        // Check duplicate place across entire itinerary
        if (globallySeenPlaceIds.has(item.placeId)) {
          conflicts.push({
            code: "DUPLICATE_PLACE",
            category: "place",
            severity: "critical",
            action: "REJECT",
            affectedDay: day.day,
            placeId: item.placeId,
            placeName: item.placeName,
            message: `Place '${item.placeName}' (${item.placeId}) is scheduled multiple times in the itinerary.`,
            userFacingExplanation: `Duplicate visit to '${item.placeName}' removed to prevent redundant scheduling.`
          });
          blockedItems.push({
            placeId: item.placeId,
            placeName: item.placeName,
            reason: "Duplicate place in itinerary",
            code: "DUPLICATE_PLACE"
          });
        }
        globallySeenPlaceIds.add(item.placeId);

        // Grounding check: verify place exists in candidate pool if candidatePlaces provided
        if (candidatePlaces && candidatePlaces.length > 0 && !validPlaceMap.has(item.placeId)) {
          conflicts.push({
            code: "INVALID_PLACE_ID",
            category: "place",
            severity: "critical",
            action: "REJECT",
            affectedDay: day.day,
            placeId: item.placeId,
            placeName: item.placeName,
            message: `Place '${item.placeName}' (${item.placeId}) does not exist in verified candidate database.`,
            userFacingExplanation: `Place '${item.placeName}' was not found in verified official records and cannot be scheduled.`
          });
          blockedItems.push({
            placeId: item.placeId,
            placeName: item.placeName,
            reason: "Unverified / fabricated place ID",
            code: "INVALID_PLACE_ID"
          });
        }
      }
    }

    // Multi-destination validation (Phase 8C)
    if (multiPlan) {
      for (const leg of multiPlan.selectedDestinations || []) {
        if (seenDestinationIds.has(leg.id)) {
          conflicts.push({
            code: "DUPLICATE_DESTINATION",
            category: "multi_destination",
            severity: "critical",
            action: "REJECT",
            destinationId: leg.id,
            destinationName: leg.name,
            message: `Destination '${leg.name}' is allocated multiple legs in multi-destination plan.`,
            userFacingExplanation: `Redundant destination leg '${leg.name}' removed.`
          });
        }
        seenDestinationIds.add(leg.id);
      }
    }

    // -----------------------------------------------------------------------
    // 3. Safety Validation (Phase 7B + Safety hard constraints)
    // -----------------------------------------------------------------------
    const isWomenSafety = Boolean(travellerContext.safetyContext?.womenSafetyRelevant?.value);
    if (intelligenceContext?.safetyAlerts && intelligenceContext.safetyAlerts.length > 0) {
      for (const alert of intelligenceContext.safetyAlerts) {
        if (alert.severity === "critical" || alert.severity === "high") {
          conflicts.push({
            code: "SAFETY_CRITICAL_ALERT",
            category: "safety",
            severity: "critical",
            action: "REJECT",
            destinationId: alert.destinationId,
            message: `Active verified safety alert: ${alert.title}`,
            userFacingExplanation: `Active official safety alert for this destination: ${alert.title}. Travel is not recommended under current conditions.`
          });
        }
      }
    }

    if (
      isWomenSafety &&
      intelligenceContext?.safetyIncidents &&
      intelligenceContext.safetyIncidents.length > 0
    ) {
      conflicts.push({
        code: "SAFETY_INCIDENT_WARNING",
        category: "safety",
        severity: "medium",
        action: "WARN",
        message: "Recent safety incidents recorded in destination records.",
        userFacingExplanation:
          "Verified safety incidents are on record for this destination. Women emergency contacts (1091 / 112) are provided."
      });
    }

    // -----------------------------------------------------------------------
    // 4. Accessibility Validation (Phase 7C Wheelchair & Elevators)
    // -----------------------------------------------------------------------
    const accNeeds = travellerContext.travellerProfile?.accessibilityNeeds?.value || [];
    const requiresWheelchair = accNeeds.some(
      (n) => n.toLowerCase().includes("wheelchair") || n.toLowerCase().includes("ramp")
    );

    if (requiresWheelchair) {
      for (const day of days) {
        for (const item of day.items || []) {
          const candidate = validPlaceMap.get(item.placeId);
          if (candidate) {
            if (candidate.isWheelchairAccessible === false) {
              conflicts.push({
                code: "WHEELCHAIR_ACCESS_UNSUPPORTED",
                category: "accessibility",
                severity: "critical",
                action: "REJECT",
                affectedDay: day.day,
                placeId: item.placeId,
                placeName: item.placeName,
                message: `Place '${item.placeName}' is verified as NOT wheelchair accessible.`,
                userFacingExplanation: `Wheelchair access is required, but verified accessibility support is not available for '${item.placeName}'.`
              });
              blockedItems.push({
                placeId: item.placeId,
                placeName: item.placeName,
                reason: "Inaccessible place for wheelchair user",
                code: "WHEELCHAIR_ACCESS_UNSUPPORTED"
              });
            } else if (
              candidate.isWheelchairAccessible === undefined ||
              candidate.isWheelchairAccessible === null
            ) {
              conflicts.push({
                code: "WHEELCHAIR_ACCESS_UNKNOWN",
                category: "accessibility",
                severity: "medium",
                action: "WARN",
                affectedDay: day.day,
                placeId: item.placeId,
                placeName: item.placeName,
                message: `Wheelchair accessibility for '${item.placeName}' is unverified in official records.`,
                userFacingExplanation: `Wheelchair accessibility for '${item.placeName}' is unindexed. Please confirm with venue operators prior to arrival.`
              });
            }
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // 5. Explicit Prohibitions & Avoid Interests (Hard Exclusion)
    // -----------------------------------------------------------------------
    const avoidInterests = (travellerContext.travellerProfile?.avoidInterests?.value || []).map(
      (a) => a.toLowerCase()
    );
    if (avoidInterests.length > 0) {
      for (const day of days) {
        for (const item of day.items || []) {
          const candidate = validPlaceMap.get(item.placeId);
          const category = (candidate?.category || "").toLowerCase();
          const name = (item.placeName || "").toLowerCase();
          const desc = (candidate?.description || item.reason || "").toLowerCase();

          for (const avoid of avoidInterests) {
            if (category.includes(avoid) || name.includes(avoid) || desc.includes(avoid)) {
              conflicts.push({
                code: "EXPLICIT_INTEREST_EXCLUDED",
                category: "explicit_prohibition",
                severity: "high",
                action: "REJECT",
                affectedDay: day.day,
                placeId: item.placeId,
                placeName: item.placeName,
                message: `Place '${item.placeName}' conflicts with explicit exclusion: '${avoid}'.`,
                userFacingExplanation: `Item '${item.placeName}' was excluded because you requested to avoid '${avoid}'.`
              });
              blockedItems.push({
                placeId: item.placeId,
                placeName: item.placeName,
                reason: `Explicitly excluded interest (${avoid})`,
                code: "EXPLICIT_INTEREST_EXCLUDED"
              });
            }
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // 6. Hard Budget Validation (Phase 7D)
    // -----------------------------------------------------------------------
    const budgetAmount = travellerContext.budget?.amount?.value ?? null;
    const isHardBudget = travellerContext.budget?.priority?.value === "hard_limit";
    if (budgetAmount !== null && budgetAmount > 0) {
      let knownMandatoryCosts = 0;
      for (const day of days) {
        for (const item of day.items || []) {
          const candidate = validPlaceMap.get(item.placeId);
          if (candidate?.entryFee?.amount) {
            knownMandatoryCosts += candidate.entryFee.amount;
          } else if (item.entryFee?.amount) {
            knownMandatoryCosts += item.entryFee.amount;
          }
        }
      }

      if (isHardBudget && knownMandatoryCosts > budgetAmount) {
        conflicts.push({
          code: "BUDGET_KNOWN_COST_EXCEEDED",
          category: "budget",
          severity: "high",
          action: "REJECT",
          message: `Known entry fee subtotal (₹${knownMandatoryCosts}) exceeds hard budget limit (₹${budgetAmount}).`,
          userFacingExplanation: `Known mandatory costs (₹${knownMandatoryCosts}) exceed your explicit budget of ₹${budgetAmount}.`
        });
      } else if (knownMandatoryCosts <= budgetAmount) {
        conflicts.push({
          code: "BUDGET_INCOMPLETE_DATA",
          category: "budget",
          severity: "low",
          action: "WARN",
          message:
            "Known attraction costs fit within budget, but dining, accommodation, and transit rates remain unindexed.",
          userFacingExplanation: `Known entry fees total ₹${knownMandatoryCosts}. Additional expenditure on accommodation, meals, and local transit will apply.`
        });
      }
    }

    // -----------------------------------------------------------------------
    // 7. Elderly Physical Constraints & Pacing (Phase 7C)
    // -----------------------------------------------------------------------
    const isElderly =
      travellerContext.travellerProfile?.travellerGroup?.value === "elderly" ||
      travellerContext.travellerProfile?.travellerGroup?.value === "parents" ||
      (travellerContext.travellerProfile?.ageContext?.value || "").toLowerCase().includes("senior");

    if (isElderly) {
      for (const day of days) {
        if ((day.items || []).length > 3) {
          conflicts.push({
            code: "ELDERLY_BARRIER_CONFLICT",
            category: "physical",
            severity: "medium",
            action: "MODIFY",
            affectedDay: day.day,
            message: `Day ${day.day} contains ${day.items.length} items, which exceeds recommended elderly pacing (max 2-3 stops/day).`,
            userFacingExplanation: `Relaxed pacing recommended for senior travellers (2–3 stops per day).`
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // 8. Crowd Soft Preference (Phase 7A)
    // -----------------------------------------------------------------------
    const avoidCrowds = Boolean(travellerContext.preferences?.avoidCrowds?.value);
    if (avoidCrowds && intelligenceContext?.crowdAssessments) {
      for (const [destId, assessment] of Object.entries(intelligenceContext.crowdAssessments)) {
        if (assessment.level === "high" && assessment.confidence >= 0.8) {
          conflicts.push({
            code: "CROWD_HIGH_CONFIDENCE_CONFLICT",
            category: "crowd",
            severity: "medium",
            action: "MODIFY",
            destinationId: destId,
            message: "Destination has high expected crowd levels during requested visiting window.",
            userFacingExplanation:
              "High crowd levels expected at this destination. Early morning or off-peak hours recommended."
          });
        } else if (assessment.level === "high") {
          conflicts.push({
            code: "CROWD_LOW_CONFIDENCE_WARNING",
            category: "crowd",
            severity: "low",
            action: "WARN",
            destinationId: destId,
            message: "Baseline heuristic suggests potential crowd peak; confidence is limited.",
            userFacingExplanation:
              "Crowd levels may be elevated based on baseline seasonal estimates."
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // 9. Sustainability Preference & Carbon Limitations (Phase 7H)
    // -----------------------------------------------------------------------
    const preferEco = Boolean(travellerContext.preferences?.preferEco?.value);
    if (preferEco) {
      conflicts.push({
        code: "CARBON_UNAVAILABLE",
        category: "sustainability",
        severity: "info",
        action: "WARN",
        message: "Verified carbon emission factors are uncatalogued in current database.",
        userFacingExplanation:
          "Eco-friendly options prioritize community stays and train proximity; exact carbon calculations are not estimated."
      });
    }

    // -----------------------------------------------------------------------
    // 10. Compile Status, Warnings, Resolutions, and Result DTO
    // -----------------------------------------------------------------------
    const hasCritical = conflicts.some((c) => c.severity === "critical");
    const hasHigh = conflicts.some((c) => c.severity === "high");
    const hasMedium = conflicts.some((c) => c.severity === "medium");

    let status: ValidationStatus = "valid";
    if (hasCritical || hasHigh) {
      status = "invalid";
    } else if (hasMedium || conflicts.some((c) => c.severity === "low" && c.action === "WARN")) {
      status = "conditional";
    }

    for (const c of conflicts) {
      if (
        c.action === "WARN" ||
        c.severity === "medium" ||
        c.severity === "low" ||
        c.severity === "info"
      ) {
        warnings.push(c.userFacingExplanation);
      }
      resolutions.push({
        category: c.category,
        code: c.code,
        action: c.action,
        summary: c.userFacingExplanation
      });
    }

    unknowns.push(
      ...(travellerContext.unknownUserData || []),
      "exact_carbon_emissions",
      "dining_and_hotel_commercial_rates"
    );

    const valid = status !== "invalid";
    const summary = valid
      ? status === "conditional"
        ? `Plan is feasible with ${warnings.length} advisory notice(s).`
        : "Plan fully passes all deterministic cross-gap validation checks."
      : `Plan contains ${conflicts.filter((c) => c.severity === "critical" || c.severity === "high").length} hard constraint violation(s).`;

    logger.info(
      {
        valid,
        status,
        conflictsCount: conflicts.length,
        blockedCount: blockedItems.length,
        warningsCount: warnings.length
      },
      "CrossGapValidator completed evaluation"
    );

    return {
      valid,
      status,
      summary,
      conflicts,
      blockedItems,
      modifiedItems,
      warnings: Array.from(new Set(warnings)),
      resolutions,
      unknowns: Array.from(new Set(unknowns))
    };
  }

  /**
   * Applies deterministic validation and sanitization to any OrchestratorResponseDto.
   * If the plan contains critical hard conflicts, blocks the invalid output and
   * generates a transparent, safe, grounded response.
   */
  sanitizeResponse(
    response: OrchestratorResponseDto,
    options: CrossGapValidationOptions
  ): OrchestratorResponseDto {
    const days = response.days || response.itinerary || [];
    const validationResult = this.validate(days, options);

    response.crossGapValidation = validationResult;

    // Merge validation warnings into response.warnings
    if (validationResult.warnings.length > 0) {
      response.warnings = Array.from(
        new Set([...(response.warnings || []), ...validationResult.warnings])
      );
    }

    // If hard invalid, block invalid items from days
    if (!validationResult.valid && validationResult.blockedItems.length > 0) {
      const blockedIdSet = new Set(validationResult.blockedItems.map((b) => b.placeId));
      if (response.days) {
        response.days = response.days.map((day) => ({
          ...day,
          items: day.items.filter((item) => !blockedIdSet.has(item.placeId))
        }));
      }
      if (response.itinerary) {
        response.itinerary = response.itinerary.map((day) => ({
          ...day,
          items: day.items.filter((item) => !blockedIdSet.has(item.placeId))
        }));
      }

      response.summary = `Validation notice: Some proposed activities could not be scheduled due to verified constraints (${validationResult.blockedItems.map((b) => b.reason).join("; ")}). ${response.summary}`;
    }

    // Informational queries (destination_information, search) must never return day-by-day itineraries
    const isNonPlanningIntent =
      response.intent === "destination_information" ||
      response.intent === "destination_search" ||
      response.intent === "general_tourism_query";
    if (isNonPlanningIntent) {
      response.days = [];
      response.itinerary = [];
    }

    // Safety phrasing grounding: replace generic "safe tourism guide" with "verified tourism guide"
    if (response.summary && response.summary.includes("safe tourism guide")) {
      response.summary = response.summary.replace(/safe tourism guide/gi, "verified tourism guide");
    }

    // Filter recommendations against unverified places if candidatePlaces provided
    if (options.candidatePlaces && response.recommendations) {
      const candidateNames = new Set(options.candidatePlaces.map((c) => c.name.toLowerCase()));
      const candidateIds = new Set(options.candidatePlaces.map((c) => c.id));
      if (response.destination?.name) {
        candidateNames.add(response.destination.name.toLowerCase());
      }
      if (response.destination?.id) {
        candidateIds.add(response.destination.id);
      }
      response.recommendations = response.recommendations.filter(
        (rec) =>
          candidateNames.has(rec.title.toLowerCase()) ||
          rec.category === "Multi-destination stop" ||
          rec.category === "Destination Overview"
      );
    }

    // Deduplicate provenance sources without removing any unique provider/resource combinations
    if (response.sources && response.sources.length > 0) {
      const seen = new Set<string>();
      response.sources = response.sources.filter((s) => {
        const key = `${s.type}:${s.provider}:${s.resource}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    return response;
  }
}

export const crossGapValidator = new CrossGapValidator();
