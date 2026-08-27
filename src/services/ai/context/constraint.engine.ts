import { ExtractedEntities } from "../../../types/ai";
import {
  Constraint,
  ConstraintCategory,
  CONSTRAINT_PRIORITY_ORDER,
  ConstraintResolution,
  ResolvedConflict,
  SafeTravellerContextSummary,
  TravellerContext
} from "../../../types/travellerContext";

export interface CandidateEligibilityResult {
  eligible: Array<{ id: string; name: string; compliant: boolean; violations: string[] }>;
  excludedCount: number;
  exclusionWarnings: string[];
}

export class ConstraintEngine {
  /**
   * Derives the deterministic constraint set from the normalized context.
   *
   * Implemented priority ordering (CONSTRAINT_PRIORITY_ORDER):
   *   1. safety                     (hard when women-safety relevant / safety priority stored)
   *   2. accessibility              (hard when explicitly required)
   *   3. explicit_prohibition       (hard — explicit avoid-interest exclusions)
   *   4. feasibility                (hard — travel dates / opening-hour feasibility)
   *   5. physical                   (hard for reduced mobility requirements)
   *   6. budget                     (hard limit ONLY when amount explicitly given;
   *                                  unknown cost categories stay unknown per Phase 7D)
   *   7. interest                   (soft)
   *   8. crowd                      (soft)
   *   9. sustainability             (soft)
   *  10. optimization               (objectives)
   */
  resolveConstraints(context: TravellerContext): ConstraintResolution {
    const constraints: Constraint[] = [];
    const rank = (category: ConstraintCategory): number =>
      CONSTRAINT_PRIORITY_ORDER.indexOf(category) + 1;

    const push = (
      id: string,
      category: ConstraintCategory,
      strength: Constraint["strength"],
      description: string,
      source: Constraint["source"]
    ): void => {
      constraints.push({ id, category, strength, description, source, priority: rank(category) });
    };

    // 1. Safety — highest precedence, never overridden by eco/cheap/crowd goals
    if (context.safetyContext.womenSafetyRelevant.value) {
      push(
        "safety.women_relevant",
        "safety",
        "hard",
        "Verified safety context must be maximized; destinations with active critical alerts require explicit caution disclosure.",
        context.safetyContext.womenSafetyRelevant.source
      );
    }

    // 2. Explicit accessibility requirements — hard constraint
    const accNeeds = context.travellerProfile.accessibilityNeeds.value;
    if (accNeeds.length > 0) {
      push(
        "accessibility.required",
        "accessibility",
        "hard",
        `Explicit accessibility requirement(s): ${accNeeds.join(", ")}. Candidates without verified compliance are NOT eligible.`,
        context.travellerProfile.accessibilityNeeds.source
      );
    }

    // 3. Explicit prohibitions — hard exclusion
    if (context.travellerProfile.avoidInterests.value.length > 0) {
      push(
        "prohibition.avoid_interests",
        "explicit_prohibition",
        "hard",
        `Traveller explicitly excludes: ${context.travellerProfile.avoidInterests.value.join(", ")}.`,
        context.travellerProfile.avoidInterests.source
      );
    }

    // 4. Feasibility — dates/opening hours known
    if (context.tripContext.travelDates.start.value) {
      push(
        "feasibility.travel_dates",
        "feasibility",
        "hard",
        `Requested travel start date ${context.tripContext.travelDates.start.value} must be respected for opening-hour feasibility.`,
        context.tripContext.travelDates.start.source
      );
    }

    // 5. Physical constraints
    if (context.travellerProfile.mobilityNeeds.value.length > 0) {
      push(
        "physical.mobility",
        "physical",
        "soft",
        `Reduced-mobility support preferred: ${context.travellerProfile.mobilityNeeds.value.join(", ")}.`,
        context.travellerProfile.mobilityNeeds.source
      );
    }
    if (
      context.travellerProfile.travellerGroup.value === "parents" ||
      context.travellerProfile.travellerGroup.value === "elderly" ||
      context.travellerProfile.ageContext.value === "senior"
    ) {
      push(
        "physical.pacing",
        "physical",
        "soft",
        "Senior/parent travellers require relaxed pacing and verified resting facilities where available.",
        "derived"
      );
    }

    // 6. Budget — hard limit only when explicitly specified in THIS request.
    // Unknown cost categories remain unknown (Phase 7D uncertainty preserved):
    // the constraint applies ONLY to verified entry fees.
    if (context.budget.amount.value != null && context.budget.priority.value === "hard_limit") {
      push(
        "budget.hard_limit",
        "budget",
        "hard",
        `Verified entry fees must fit within the explicitly stated budget of ${context.budget.amount.value} ${context.budget.currency.value ?? "INR"}. Accommodation/food/transport remain UNKNOWN — no within-budget claim may be made about them.`,
        context.budget.amount.source
      );
    } else if (context.budget.amount.value != null) {
      push(
        "budget.soft_guide",
        "budget",
        "soft",
        `Stored budget guide of ${context.budget.amount.value} ${context.budget.currency.value ?? "INR"} should be optimized where verified data supports it.`,
        context.budget.amount.source
      );
    }

    // 7. Interests — soft preference
    if (context.travellerProfile.interests.value.length > 0) {
      push(
        "interest.match",
        "interest",
        "soft",
        `Maximize verified match with interests: ${context.travellerProfile.interests.value.join(", ")}.`,
        context.travellerProfile.interests.source
      );
    }

    // 8. Crowd preference — SOFT, never overrides accessibility/safety
    if (context.preferences.avoidCrowds.value === true) {
      push(
        "crowd.avoid",
        "crowd",
        "soft",
        "Avoid crowded places where verified rush-free windows allow it. Must not override accessibility or safety.",
        context.preferences.avoidCrowds.source
      );
    }

    // 9. Sustainability — SOFT, never overrides accessibility/safety/prohibitions
    if (
      context.preferences.preferEco.value === true ||
      context.preferences.communityPreference.value === true
    ) {
      push(
        "sustainability.eco_community",
        "sustainability",
        "soft",
        `Prefer verified eco/community-oriented options${context.preferences.minimizeTravel.value === true ? " and minimize unnecessary travel" : ""}. Must not override accessibility, safety, or explicit requirements.`,
        context.preferences.preferEco.value === true
          ? context.preferences.preferEco.source
          : context.preferences.communityPreference.source
      );
    }

    // 10. Optimization objectives
    if (context.preferences.minimizeTravel.value === true) {
      push(
        "objective.minimize_travel",
        "optimization",
        "objective",
        "Minimize total travel distance between sequenced stops.",
        context.preferences.minimizeTravel.source
      );
    }
    push(
      "objective.fee_minimization",
      "optimization",
      "objective",
      "Prefer lower verified entry fees and free attractions where compatible with higher-priority constraints.",
      "derived"
    );
    if (context.preferences.communityPreference.value === true) {
      push(
        "objective.community_businesses",
        "optimization",
        "objective",
        "Maximize inclusion of verified local/community businesses.",
        context.preferences.communityPreference.source
      );
    }

    const conflicts = this.detectConflicts(constraints);

    return {
      constraints,
      hardConstraints: constraints.filter((c) => c.strength === "hard"),
      softPreferences: constraints.filter((c) => c.strength === "soft"),
      objectives: constraints.filter((c) => c.strength === "objective"),
      conflicts
    };
  }

  /**
   * Deterministic conflict resolution: the lower-priority-number category wins.
   * Example: wheelchair-required (accessibility, rank 2) beats avoid-crowds
   * (crowd, rank 8). An accessible-but-crowded candidate stays eligible; a
   * quiet-but-inaccessible one does not.
   */
  detectConflicts(constraints: Constraint[]): ResolvedConflict[] {
    const conflicts: ResolvedConflict[] = [];

    const accessibility = constraints.find((c) => c.category === "accessibility");
    const crowd = constraints.find((c) => c.category === "crowd");
    const sustainability = constraints.find((c) => c.category === "sustainability");
    const budget = constraints.find((c) => c.category === "budget");

    if (accessibility && crowd) {
      conflicts.push({
        betweenCategories: ["accessibility", "crowd"],
        winnerCategory: "accessibility",
        rationale:
          "Accessibility is a hard constraint; an accessible-but-crowded option remains eligible while a quiet-but-inaccessible option is not eligible."
      });
    }
    if ((accessibility || this.hasHardAbove(sustainability, constraints)) && sustainability) {
      const winner = this.higherPriorityWinner(sustainability, constraints);
      conflicts.push({
        betweenCategories: [winner.category, "sustainability"],
        winnerCategory: winner.category,
        rationale:
          "Sustainability is a soft preference (rank 9); it cannot override higher-priority constraints."
      });
    }
    if (budget?.strength === "hard" && sustainability) {
      conflicts.push({
        betweenCategories: ["budget", "sustainability"],
        winnerCategory: "budget",
        rationale:
          "An explicit budget limit applies to all candidates regardless of sustainability orientation."
      });
    }

    return conflicts;
  }

  private hasHardAbove(category: Constraint | undefined, constraints: Constraint[]): boolean {
    if (!category) return false;
    return constraints.some(
      (c) =>
        c.strength === "hard" && c.priority < category.priority && c.category !== category.category
    );
  }

  private higherPriorityWinner(category: Constraint, constraints: Constraint[]): Constraint {
    const harders = constraints
      .filter((c) => c.strength === "hard" && c.priority < category.priority)
      .sort((a, b) => a.priority - b.priority);
    return harders[0] ?? category;
  }

  /**
   * HARD eligibility filtering applied BEFORE ranking.
   * Accessibility-unknown candidates are treated as UNVERIFIED (not as
   * non-compliant and not as compliant) — they are excluded from the
   * wheelchair-eligible set but reported honestly rather than silently kept.
   */
  filterCandidates<T extends { id: string; name: string }>(
    candidates: T[],
    isCompliant: (candidate: T) => boolean | null,
    resolution: ConstraintResolution
  ): CandidateEligibilityResult & { fullyCompliant: T[] } {
    const warnings: string[] = [];
    const accessibilityHard = resolution.hardConstraints.some(
      (c) => c.category === "accessibility"
    );

    const evaluated = candidates.map((c) => {
      const verdict = isCompliant(c);
      return {
        candidate: c,
        compliant: verdict,
        violations: verdict === false ? ["accessibility_not_verified_compliant"] : []
      };
    });

    let eligible = evaluated.filter((e) => e.compliant !== false);

    if (accessibilityHard) {
      const compliant = evaluated.filter((e) => e.compliant === true);
      if (compliant.length > 0) {
        eligible = compliant;
      } else if (evaluated.length > 0) {
        // Zero verified-compliant candidates: keep unverified ones ONLY with an
        // explicit warning — never claim compliance that isn't verified.
        warnings.push(
          "No verified wheelchair-accessible candidates were found in the database. Remaining options have UNKNOWN accessibility status and are presented without any accessibility guarantee."
        );
      }
    }

    return {
      eligible: eligible.map((e) => ({
        id: e.candidate.id,
        name: e.candidate.name,
        compliant: e.compliant ?? true,
        violations: e.violations
      })),
      fullyCompliant: eligible.map((e) => e.candidate),
      excludedCount: evaluated.length - eligible.length,
      exclusionWarnings: warnings
    };
  }

  /** Builds the sanitized LLM-safe summary. No ids/emails/private metadata. */
  toSafeSummary(
    context: TravellerContext,
    resolution: ConstraintResolution
  ): SafeTravellerContextSummary {
    const boolOrNull = (v: boolean | null): boolean | null => v;
    return {
      authenticated: context.identity.authenticated,
      travellerGroup: context.travellerProfile.travellerGroup.value,
      accessibilityRequirements: [...context.travellerProfile.accessibilityNeeds.value],
      mobilityNeeds: [...context.travellerProfile.mobilityNeeds.value],
      interests: [...context.travellerProfile.interests.value],
      avoidInterests: [...context.travellerProfile.avoidInterests.value],
      budgetAmount: context.budget.amount.value,
      budgetPriority: context.budget.priority.value,
      avoidCrowds: boolOrNull(context.preferences.avoidCrowds.value),
      preferEco: boolOrNull(context.preferences.preferEco.value),
      communityPreference: boolOrNull(context.preferences.communityPreference.value),
      minimizeTravel: boolOrNull(context.preferences.minimizeTravel.value),
      womenSafetyRelevant: context.safetyContext.womenSafetyRelevant.value,
      soloFemale: context.safetyContext.soloFemale.value,
      targetLanguage: context.contentPreferences.targetLanguage.value,
      durationDays: context.tripContext.durationDays.value,
      activeTrip: context.activeTrip
        ? {
            name: context.activeTrip.name,
            startDate: context.activeTrip.startDate,
            endDate: context.activeTrip.endDate,
            durationDays: context.activeTrip.durationDays,
            itineraryItemCount: context.activeTrip.itineraryItemCount
          }
        : null,
      unknownFields: [...context.unknownUserData],
      activeHardConstraints: resolution.hardConstraints.map((c) => `${c.id}: ${c.description}`),
      activeSoftPreferences: resolution.softPreferences.map((c) => `${c.id}: ${c.description}`),
      objectives: resolution.objectives.map((c) => `${c.id}: ${c.description}`),
      conflictNotes: resolution.conflicts.map(
        (c) =>
          `${c.betweenCategories[0]} vs ${c.betweenCategories[1]} → ${c.winnerCategory} wins: ${c.rationale}`
      )
    };
  }

  /**
   * Merges request entities with derived stored-preference entities so that
   * downstream tools receive ONE effective entity set. Request values always
   * win; stored values only fill gaps. Never writes back to storage.
   */
  deriveEffectiveEntities(
    entities: ExtractedEntities,
    context: TravellerContext
  ): ExtractedEntities {
    const effective: ExtractedEntities = { ...entities };

    if (!effective.days && context.tripContext.durationDays.value) {
      effective.days = context.tripContext.durationDays.value;
    }
    if (!effective.userBudget && context.budget.amount.value != null) {
      effective.userBudget = context.budget.amount.value;
      effective.isBudgetConstrained = true;
    }
    if (
      (!effective.accessibilityNeeds || effective.accessibilityNeeds.length === 0) &&
      context.travellerProfile.accessibilityNeeds.value.length > 0 &&
      context.travellerProfile.accessibilityNeeds.source === "stored_preference"
    ) {
      effective.accessibilityNeeds = [...context.travellerProfile.accessibilityNeeds.value];
      if (effective.accessibilityNeeds.includes("wheelchair")) {
        effective.requiresWheelchair = true;
      }
    }
    if (
      !effective.travellerGroup &&
      context.travellerProfile.travellerGroup.value &&
      ["solo", "family", "elderly"].includes(context.travellerProfile.travellerGroup.value)
    ) {
      effective.travellerGroup = context.travellerProfile.travellerGroup
        .value as ExtractedEntities["travellerGroup"];
    }
    if (
      (!effective.interests || effective.interests.length === 0) &&
      context.travellerProfile.interests.value.length > 0
    ) {
      effective.interests = [...context.travellerProfile.interests.value];
    }

    return effective;
  }
}

export const constraintEngine = new ConstraintEngine();
