import { ExtractedEntities, TourismIntent } from "../../../types/ai";
import { AuthenticatedUser } from "../../../types/auth";
import {
  SourcedValue,
  TravellerContext,
  ContextSource,
  ContextConfidence
} from "../../../types/travellerContext";
import { preferencesService, PreferencesService } from "../../../services/preferences.service";
import { userRepository, UserRepository } from "../../../repositories/user.repository";
import { tripService, TripService } from "../../../services/trip.service";
import { savedPlacesService, SavedPlacesService } from "../../../services/savedPlaces.service";
import { logger } from "../../../lib/logger";

/**
 * Intents for which persisted traveller data is relevant. For all other
 * intents stored preferences are NOT loaded (performance + privacy: only
 * context required by the request is read).
 */
const PERSONALIZED_INTENTS: readonly TourismIntent[] = [
  "trip_planning",
  "itinerary_help",
  "budget_query",
  "experience_query",
  "local_business_query",
  "content_query"
];

interface StoredBundle {
  profile: Awaited<ReturnType<PreferencesService["getPreferences"]>>;
  preferredLanguage: string | null;
}

export class TravellerContextBuilder {
  constructor(
    private readonly prefsService: PreferencesService = preferencesService,
    private readonly usersRepository: UserRepository = userRepository,
    private readonly tripsService: TripService = tripService,
    private readonly placesService: SavedPlacesService = savedPlacesService
  ) {}

  /**
   * Builds the normalized, request-scoped TravellerContext.
   * NEVER persists anything. User identity comes exclusively from the
   * validated AuthenticatedUser — never from client-supplied ids.
   *
   * Phase 8B additions:
   *  - forceStoredLoad: loads stored preferences regardless of intent
   *    (used by the protected context-preview endpoint).
   *  - tripId / includeRecentTrip: loads OWN persisted trip context via the
   *    existing ownership-verifying TripService. Only ONE bounded trip is
   *    loaded, never the full history.
   */
  async buildContext(input: {
    entities: ExtractedEntities;
    intent: TourismIntent;
    user?: AuthenticatedUser;
    forceStoredLoad?: boolean;
    tripId?: string | null;
    includeRecentTrip?: boolean;
  }): Promise<TravellerContext> {
    const { entities, intent, user, forceStoredLoad = false } = input;

    const knownUserData: string[] = [];
    const unknownUserData: string[] = [];

    // ------------------------------------------------------------------
    // Identity — only from validated auth context
    // ------------------------------------------------------------------
    const identity = {
      authenticated: Boolean(user?.id),
      userId: user?.id ?? null,
      role: user?.role ?? user?.roles?.[0] ?? null
    };

    // ------------------------------------------------------------------
    // Stored preferences — lazily loaded only when relevant + authorized
    // ------------------------------------------------------------------
    let stored: StoredBundle | null = null;
    if (user?.id && (forceStoredLoad || PERSONALIZED_INTENTS.includes(intent))) {
      stored = await this.loadStoredPreferences(user.id);
    }

    // ------------------------------------------------------------------
    // Trip context (Phase 8B) — OWN persisted trip, ownership verified by
    // the existing TripService. Only loaded when explicitly relevant.
    // ------------------------------------------------------------------
    const activeTrip = await this.loadTripContext(input, user);

    // ------------------------------------------------------------------
    // Trip context (request-derived; tripId is never client-trusted)
    // ------------------------------------------------------------------
    const destinationId = this.sourced<string | null>(
      entities.destinationId ?? null,
      entities.destinationId ? "explicit_request" : "unknown",
      entities.destinationId ? "high" : "unknown",
      "tripContext.destinationId",
      knownUserData,
      unknownUserData
    );
    const destinationName = this.sourced<string | null>(
      entities.destinationName ?? null,
      entities.destinationName ? "explicit_request" : "unknown",
      entities.destinationName ? "high" : "unknown",
      "tripContext.destinationName",
      knownUserData,
      unknownUserData
    );

    const tripIdValue = activeTrip?.tripId ?? null;
    const tripStart = activeTrip?.startDate ?? null;
    const tripEnd = activeTrip?.endDate ?? null;

    let durationDays = this.resolveDuration(entities, stored);
    if (durationDays.source === "unknown" && activeTrip?.durationDays) {
      durationDays = {
        value: activeTrip.durationDays,
        source: "trip_context",
        confidence: "verified"
      };
    }

    const tripContext: TravellerContext["tripContext"] = {
      destinationId,
      destinationName,
      tripId: tripIdValue
        ? { value: tripIdValue, source: "trip_context" as const, confidence: "verified" as const }
        : sourcedUnknown(),
      travelDates: {
        start: this.sourced<string | null>(
          entities.startDate ?? tripStart,
          entities.startDate
            ? "explicit_request"
            : tripStart
              ? ("trip_context" as ContextSource)
              : "unknown",
          entities.startDate || tripStart ? "verified" : "unknown",
          "tripContext.travelDates.start",
          knownUserData,
          unknownUserData
        ),
        end: this.sourced<string | null>(
          tripEnd,
          tripEnd ? ("trip_context" as ContextSource) : "unknown",
          tripEnd ? "verified" : "unknown",
          "tripContext.travelDates.end",
          knownUserData,
          unknownUserData
        )
      },
      durationDays,
      travellerCount: this.resolveTravellerCount(entities)
    };
    if (durationDays.source === "unknown") {
      unknownUserData.push("tripContext.durationDays");
    } else {
      knownUserData.push("tripContext.durationDays");
    }
    if (tripContext.travellerCount.source === "unknown") {
      unknownUserData.push("tripContext.travellerCount");
    } else {
      knownUserData.push("tripContext.travellerCount");
    }

    // ------------------------------------------------------------------
    // Traveller profile — request overrides stored for THIS request only
    // ------------------------------------------------------------------
    const travellerGroup = this.mergeScalar(
      entities.travellerGroup ?? null,
      entities.travellerGroup
        ? ("explicit_request" as ContextSource)
        : ("unknown" as ContextSource),
      derivedGroupFromStored(stored),
      derivedGroupFromStored(stored)
        ? ("stored_profile" as ContextSource)
        : ("unknown" as ContextSource),
      "travellerProfile.travellerGroup",
      knownUserData,
      unknownUserData
    );

    const interests = this.mergeList(
      entities.interests ?? [],
      entities.interests?.length ? "explicit_request" : "unknown",
      stored?.profile.travelPreferences?.interests ?? [],
      stored?.profile.travelPreferences?.interests?.length ? "stored_preference" : "unknown",
      "travellerProfile.interests",
      knownUserData,
      unknownUserData
    );

    // NOTE: no stored avoid-interest equivalent exists in the schema.
    const avoidInterests = this.mergeList(
      entities.avoidInterests ?? [],
      entities.avoidInterests?.length ? "explicit_request" : "unknown",
      [],
      "unknown",
      "travellerProfile.avoidInterests",
      knownUserData,
      unknownUserData
    );

    const accessibilityNeeds = this.mergeList(
      entities.accessibilityNeeds ?? [],
      entities.accessibilityNeeds?.length ? "explicit_request" : "unknown",
      stored?.profile.travelPreferences?.accessibility_needs ?? [],
      stored?.profile.travelPreferences?.accessibility_needs?.length
        ? "stored_preference"
        : "unknown",
      "travellerProfile.accessibilityNeeds",
      knownUserData,
      unknownUserData
    );

    // Wheelchair flag implies an explicit accessibility need even when the
    // keyword list extraction did not populate accessibilityNeeds.
    if (entities.requiresWheelchair && !accessibilityNeeds.value.includes("wheelchair")) {
      accessibilityNeeds.value = [...accessibilityNeeds.value, "wheelchair"];
    }

    const mobilityNeeds = this.mergeList(
      entities.reducedMobility ? ["reduced_mobility"] : [],
      entities.reducedMobility ? "explicit_request" : "unknown",
      stored?.profile.touristProfile?.mobility_needs ?? [],
      stored?.profile.touristProfile?.mobility_needs?.length ? "stored_profile" : "unknown",
      "travellerProfile.mobilityNeeds",
      knownUserData,
      unknownUserData
    );

    const ageContext = this.mergeScalar<string | null>(
      null,
      "unknown",
      stored?.profile.touristProfile?.age_group ?? null,
      stored?.profile.touristProfile?.age_group ? "stored_profile" : "unknown",
      "travellerProfile.ageContext",
      knownUserData,
      unknownUserData
    );

    const travelStyle = this.mergeScalar<string | null>(
      null,
      "unknown",
      stored?.profile.touristProfile?.travel_style ?? null,
      stored?.profile.touristProfile?.travel_style ? "stored_profile" : "unknown",
      "travellerProfile.travelStyle",
      knownUserData,
      unknownUserData
    );

    const preferredLanguage = this.mergeScalar<string | null>(
      null,
      "unknown",
      stored?.preferredLanguage ?? null,
      stored?.preferredLanguage ? "stored_profile" : "unknown",
      "travellerProfile.preferredLanguage",
      knownUserData,
      unknownUserData
    );

    // ------------------------------------------------------------------
    // Budget — request amount wins for this request; stored budget_max is
    // a soft guide. Request-level values NEVER mutate stored preferences.
    // ------------------------------------------------------------------
    let budgetAmount: SourcedValue<number | null>;
    let budgetPriority: SourcedValue<"hard_limit" | "soft_guide" | null>;
    if (entities.userBudget !== undefined) {
      budgetAmount = { value: entities.userBudget, source: "explicit_request", confidence: "high" };
      budgetPriority = {
        value: "hard_limit",
        source: "explicit_request",
        confidence: "high"
      };
      knownUserData.push("budget.amount", "budget.priority");
    } else if (
      !entities.userBudget &&
      stored?.profile.travelPreferences?.budget_max != null &&
      PERSONALIZED_INTENTS.includes(intent)
    ) {
      budgetAmount = {
        value: stored.profile.travelPreferences.budget_max,
        source: "stored_preference",
        confidence: "verified"
      };
      budgetPriority = { value: "soft_guide", source: "stored_preference", confidence: "verified" };
      knownUserData.push("budget.amount", "budget.priority");
    } else {
      budgetAmount = sourcedUnknown();
      budgetPriority = sourcedUnknown();
      unknownUserData.push("budget.amount", "budget.priority");
    }

    const budgetCurrency = this.sourced<string | null>(
      entities.budgetCurrency ?? (budgetAmount.value != null ? "INR" : null),
      entities.budgetCurrency
        ? "explicit_request"
        : budgetAmount.value != null
          ? "derived"
          : "unknown",
      entities.budgetCurrency ? "high" : budgetAmount.value != null ? "medium" : "unknown",
      "budget.currency",
      knownUserData,
      unknownUserData
    );

    // ------------------------------------------------------------------
    // Preference flags — no stored equivalents exist in the schema, so
    // these are request-explicit or unknown (never defaulted to false).
    // ------------------------------------------------------------------
    const preferences: TravellerContext["preferences"] = {
      avoidCrowds: this.flag(
        entities.avoidCrowds,
        "preferences.avoidCrowds",
        knownUserData,
        unknownUserData
      ),
      preferEco: this.flag(
        entities.ecoFriendlyPreference,
        "preferences.preferEco",
        knownUserData,
        unknownUserData
      ),
      communityPreference: this.flag(
        entities.communityPreference,
        "preferences.communityPreference",
        knownUserData,
        unknownUserData
      ),
      minimizeTravel: this.flag(
        entities.minimizeTravel,
        "preferences.minimizeTravel",
        knownUserData,
        unknownUserData
      )
    };

    // ------------------------------------------------------------------
    // Safety context
    // ------------------------------------------------------------------
    const storedSafetyRelevant =
      (stored?.profile.travelPreferences?.safety_priority === true ||
        (stored?.profile.touristProfile?.safety_preferences?.some((s) =>
          /women|female|solo/i.test(s)
        ) ??
          false)) ??
      false;

    const womenValue = Boolean(
      entities.isWomenTraveller || entities.isSoloFemale || storedSafetyRelevant
    );
    const womenSource: ContextSource =
      entities.isWomenTraveller || entities.isSoloFemale
        ? "explicit_request"
        : storedSafetyRelevant
          ? "stored_preference"
          : "derived";

    const safetyContext: TravellerContext["safetyContext"] = {
      womenSafetyRelevant: {
        value: womenValue,
        source: womenSource,
        confidence: womenValue ? "verified" : "medium"
      },
      soloFemale: {
        value: Boolean(entities.isSoloFemale),
        source: entities.isSoloFemale ? "explicit_request" : "derived",
        confidence: entities.isSoloFemale ? "verified" : "low"
      }
    };
    knownUserData.push("safetyContext.womenSafetyRelevant", "safetyContext.soloFemale");

    // ------------------------------------------------------------------
    // Content / language — request language applies to THIS response only;
    // the stored preference is never mutated by request-level overrides.
    // ------------------------------------------------------------------
    let targetLangValue: string | null = null;
    let targetLangSource: ContextSource = "unknown";
    if (entities.targetLanguage) {
      targetLangValue = entities.targetLanguage;
      targetLangSource = "explicit_request";
    } else if (preferredLanguage.value) {
      targetLangValue = preferredLanguage.value;
      targetLangSource = "stored_profile";
    }
    const contentPreferences: TravellerContext["contentPreferences"] = {
      targetLanguage: {
        value: targetLangValue,
        source: targetLangSource,
        confidence: targetLangValue ? "high" : "unknown"
      }
    };
    if (targetLangValue) knownUserData.push("contentPreferences.targetLanguage");
    else unknownUserData.push("contentPreferences.targetLanguage");

    return {
      identity,
      tripContext,
      activeTrip,
      travellerProfile: {
        travellerGroup,
        ageContext,
        interests,
        avoidInterests,
        preferredLanguage,
        accessibilityNeeds,
        mobilityNeeds,
        travelStyle
      },
      budget: { amount: budgetAmount, currency: budgetCurrency, priority: budgetPriority },
      preferences,
      safetyContext,
      contentPreferences,
      knownUserData: Array.from(new Set(knownUserData)),
      unknownUserData: Array.from(new Set(unknownUserData))
    };
  }

  /**
   * Loads stored preferences with graceful degradation: any storage failure
   * degrades to "unknown" instead of failing the whole request.
   */
  async loadStoredPreferences(userId: string): Promise<StoredBundle | null> {
    try {
      const [profile, userProfile] = await Promise.all([
        this.prefsService.getPreferences(userId),
        this.usersRepository.findProfileById(userId)
      ]);
      return { profile, preferredLanguage: userProfile?.preferred_language ?? null };
    } catch (err) {
      logger.warn(
        { err, userId },
        "Stored traveller preferences unavailable; degrading to unknown"
      );
      return null;
    }
  }

  /**
   * Phase 8B — loads the user's OWN persisted trip context.
   * Ownership is enforced by the existing TripService (403 on cross-user).
   * Loads at most ONE trip: either the explicitly referenced one or the most
   * recent trip when the request clearly refers to an existing trip.
   */
  private async loadTripContext(
    input: { tripId?: string | null; includeRecentTrip?: boolean },
    user?: AuthenticatedUser
  ): Promise<TravellerContext["activeTrip"]> {
    if (!user?.id) return null;
    const { tripId, includeRecentTrip } = input;
    if (!tripId && !includeRecentTrip) return null;

    try {
      let summary: TravellerContext["activeTrip"];
      if (tripId) {
        const trip = await this.tripsService.getTripById(tripId, user.id);
        summary = this.toActiveTripSummary(trip);
      } else {
        const trips = await this.tripsService.getTrips(user.id);
        if (trips.length === 0) return null;
        // Most recent trip (created_at descending, bounded to a single row read)
        const sorted = [...trips].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const trip = await this.tripsService.getTripById(sorted[0].id, user.id);
        summary = this.toActiveTripSummary(trip);
      }
      // Saved places are advisory context for trip improvement requests
      if (summary) {
        try {
          const saved = await this.placesService.getSavedPlaces(user.id);
          summary.savedPlaceNames = (saved ?? [])
            .map(
              (p) =>
                p as {
                  destination?: { name?: string } | null;
                  attraction?: { name?: string } | null;
                }
            )
            .map((p) => p.destination?.name ?? p.attraction?.name ?? null)
            .filter((n): n is string => Boolean(n))
            .slice(0, 5);
        } catch {
          summary.savedPlaceNames = [];
        }
      }
      return summary;
    } catch (err) {
      logger.debug({ err }, "Trip context unavailable for traveller context build");
      return null;
    }
  }

  private toActiveTripSummary(trip: {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
    items: Array<Record<string, unknown>>;
  }): TravellerContext["activeTrip"] {
    let durationDays: number | null = null;
    if (trip.start_date && trip.end_date) {
      const diffMs = new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime();
      const days = Math.round(diffMs / 86_400_000) + 1;
      if (days > 0 && days <= 365) durationDays = days;
    }
    return {
      tripId: trip.id,
      name: trip.name,
      startDate: trip.start_date,
      endDate: trip.end_date,
      durationDays,
      itineraryItemCount: trip.items.length
    };
  }

  /**
   * Phase 8B — explicit preference persistence path.
   * Called ONLY when the user explicitly asks to remember/save a preference
   * (or uses the preference endpoint). A normal AI conversation never calls this.
   * Merges new interests with existing stored interests and persists via the
   * existing PreferencesService update path.
   */
  async persistExplicitInterests(userId: string, newInterests: string[]): Promise<string[]> {
    const clean = [...new Set(newInterests.map((i) => i.trim().toLowerCase()).filter(Boolean))];
    if (clean.length === 0) return [];
    const stored = await this.loadStoredPreferences(userId);
    const merged = [
      ...new Set([...(stored?.profile.travelPreferences?.interests ?? []), ...clean])
    ].slice(0, 20);
    await this.prefsService.updatePreferences(userId, { interests: merged });
    return merged;
  }

  resolveRequestPreferences(entities: ExtractedEntities): ExtractedEntities {
    return entities;
  }

  private resolveDuration(
    entities: ExtractedEntities,
    stored: StoredBundle | null
  ): SourcedValue<number | null> {
    if (entities.days) {
      return { value: entities.days, source: "explicit_request", confidence: "high" };
    }
    if (stored?.profile.travelPreferences?.preferred_trip_days) {
      return {
        value: stored.profile.travelPreferences.preferred_trip_days,
        source: "stored_preference",
        confidence: "verified"
      };
    }
    return sourcedUnknown();
  }

  private resolveTravellerCount(entities: ExtractedEntities): SourcedValue<number | null> {
    const total =
      (entities.adultsCount ?? 0) +
      (entities.seniorsCount ?? 0) +
      (entities.childrenCount ?? 0) +
      (entities.studentsCount ?? 0) +
      (entities.foreignAdultsCount ?? 0);
    if (total > 0) {
      return { value: total, source: "explicit_request", confidence: "high" };
    }
    return sourcedUnknown();
  }

  private flag(
    raw: boolean | undefined,
    fieldName: string,
    known: string[],
    unknownFields: string[]
  ): SourcedValue<boolean | null> {
    if (raw === true) {
      known.push(fieldName);
      return { value: true, source: "explicit_request", confidence: "high" };
    }
    unknownFields.push(fieldName);
    return sourcedUnknown();
  }

  private mergeScalar<T>(
    requestValue: T,
    requestSource: ContextSource,
    storedValue: T,
    storedSource: ContextSource,
    fieldName: string,
    known: string[],
    unknownFields: string[],
    requestConfidence: ContextConfidence = "high"
  ): SourcedValue<T | null> {
    if (requestValue !== null && requestValue !== undefined) {
      known.push(fieldName);
      return { value: requestValue, source: requestSource, confidence: requestConfidence };
    }
    if (storedValue !== null && storedValue !== undefined) {
      known.push(fieldName);
      return { value: storedValue, source: storedSource, confidence: "verified" };
    }
    unknownFields.push(fieldName);
    return sourcedUnknown() as unknown as SourcedValue<T | null>;
  }

  private mergeList(
    requestItems: string[] | undefined,
    requestSource: ContextSource,
    storedItems: string[] | null | undefined,
    storedSource: ContextSource,
    fieldName: string,
    known: string[],
    unknownFields: string[]
  ): SourcedValue<string[]> {
    const req = requestItems ?? [];
    const stored = storedItems ?? [];

    if (req.length > 0) {
      // Request replaces stored for THIS request only; stored remains untouched.
      known.push(fieldName);
      return { value: [...req], source: requestSource, confidence: "high" };
    }
    if (stored.length > 0) {
      known.push(fieldName);
      return { value: [...stored], source: storedSource, confidence: "verified" };
    }
    unknownFields.push(fieldName);
    return { value: [], source: "unknown", confidence: "unknown" };
  }

  private sourced<T extends string | number | null>(
    value: T,
    source: ContextSource,
    confidence: ContextConfidence,
    fieldName: string,
    known: string[],
    unknownFields: string[]
  ): SourcedValue<T | null> {
    const effective = value === null || value === undefined || value === "" ? null : value;
    if (effective !== null) {
      known.push(fieldName);
      return { value: effective as T, source, confidence };
    }
    unknownFields.push(fieldName);
    return sourcedUnknown() as unknown as SourcedValue<T | null>;
  }
}

function derivedGroupFromStored(stored: StoredBundle | null): string | null {
  const tp = stored?.profile.touristProfile;
  if (!tp) return null;
  if (tp.elderly_traveller) return "elderly";
  if (tp.family_group) return "family";
  if (tp.solo_traveller) return "solo";
  return null;
}

function sourcedUnknown(): SourcedValue<null> {
  return { value: null, source: "unknown", confidence: "unknown" };
}

export const travellerContextBuilder = new TravellerContextBuilder();
