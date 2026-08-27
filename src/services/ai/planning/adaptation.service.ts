import {
  AdaptationMode,
  AdaptationResultDto,
  DetectedChange,
  ItinerarySnapshot,
  SnapshotItem
} from "../../../types/adaptive";
import { ExtractedEntities, ProvenanceSource } from "../../../types/ai";
import { AuthenticatedUser } from "../../../types/auth";
import { TravellerContext, ConstraintResolution } from "../../../types/travellerContext";
import { itineraryChangeDetector, ItineraryChangeDetector } from "./itineraryChangeDetector";
import type { PartialReplanner } from "./partialReplanner";
import { partialReplanner } from "./partialReplanner";
import { CandidateFilter, candidateFilter } from "../itinerary/candidate.filter";
import { ItinerarySequencer, itinerarySequencer } from "../itinerary/itinerary.sequencer";
import { tourismService, TourismService } from "../../../services/tourism.service";
import { weatherService, WeatherService } from "../../../services/external/weather/weather.service";
import { crowdService, CrowdService } from "../../../services/crowd.service";
import {
  womenSafetyService,
  WomenSafetyService
} from "../../../services/safety/womenSafety.service";
import { tripService, TripService } from "../../../services/trip.service";
import { logger } from "../../../lib/logger";

/**
 * Phase 8D — AdaptiveItineraryService.
 *
 * PERFORMANCE: intelligence calls are memoized per-request (one call per
 * destination per module) and only run for destinations touched by the
 * snapshot / detected triggers — never N×M over all items.
 *
 * PERSISTENCE: assess/suggest NEVER writes. Apply requires an authenticated
 * owner and flows exclusively through the existing TripService.
 */
export class AdaptiveItineraryService {
  constructor(
    private readonly tourService: TourismService = tourismService,
    private readonly wthrService: WeatherService = weatherService,
    private readonly crwdService: CrowdService = crowdService,
    private readonly wsSafety: WomenSafetyService = womenSafetyService,
    private readonly tripsSvc: TripService = tripService,
    private readonly filter: CandidateFilter = candidateFilter,
    private readonly detector: ItineraryChangeDetector = itineraryChangeDetector,
    private readonly replanner: PartialReplanner = partialReplanner,
    private readonly sequencer: ItinerarySequencer = itinerarySequencer
  ) {}

  // ---------------------------------------------------------------------
  // Trigger parsing (deterministic patterns; nothing invented)
  // ---------------------------------------------------------------------
  parseTriggers(message: string): {
    isAdaptationQuery: boolean;
    userConstraintTriggers: Array<{
      type: "accessibility" | "budget" | "preference" | "removal";
      reason: string;
      severity: "high" | "medium" | "low";
    }>;
    wantsApply: boolean;
    weatherTrigger: boolean;
  } {
    const lower = message.toLowerCase();
    const triggers: ReturnType<
      AdaptiveItineraryService["parseTriggers"]
    >["userConstraintTriggers"] = [];
    const wantsApply = /\bapply\b.*\bchanges\b|confirm (the )?changes/i.test(lower);

    const weatherTrigger =
      /(it'?s|its)\s+raining|raining today|rain(ing)?\s*(today)?[,!.]?\s*(change|adjust)/i.test(
        lower
      ) || /(bad weather|weather changed?)/i.test(lower);
    if (/avoid crowds?\s*now|avoid (the )?crowds?( now)?|too crowded now/i.test(lower)) {
      triggers.push({
        type: "preference",
        reason: "User now requests crowd avoidance for this request only.",
        severity: "low"
      });
    }
    if (
      /need wheelchair (access|support)|wheelchair.*(now|required)|need wheelchair/i.test(lower)
    ) {
      triggers.push({
        type: "accessibility",
        reason: "Newly stated wheelchair requirement becomes a HARD constraint.",
        severity: "high"
      });
    }
    // Budget CHANGE semantics required — a plain budget figure inside a fresh
    // planning request must NOT be treated as an adaptation trigger.
    const budgetChange = lower.match(
      /(?:budget\s+(?:is\s+)?now|(?:change|changed|changing)\s+(?:my\s+)?budget|budget\s+(?:has\s+)?changed)(?:[^.\d]*₹?\s*([\d,]+(?:k)?))?/
    );
    if (budgetChange) {
      const amount = budgetChange[1];
      triggers.push({
        type: "budget",
        reason: amount
          ? `User states a new budget figure (₹${amount}).`
          : "User indicates the budget has changed.",
        severity: "medium"
      });
    }
    if (/more eco[- ]friendly|make (this|the) trip more eco/i.test(lower)) {
      triggers.push({
        type: "preference",
        reason: "Sustainability preference strengthened (soft objective).",
        severity: "low"
      });
    }
    if (/remove (this|the) (attraction|place)|drop .* from (the )?(trip|itinerary)/i.test(lower)) {
      triggers.push({
        type: "removal",
        reason: "User requests removal of an attraction.",
        severity: "medium"
      });
    }

    return {
      isAdaptationQuery: weatherTrigger || triggers.length > 0 || wantsApply,
      userConstraintTriggers: triggers,
      wantsApply,
      weatherTrigger
    };
  }

  // ---------------------------------------------------------------------
  // Snapshot building — request-scoped; never persisted
  // ---------------------------------------------------------------------
  async buildSnapshotFromPlan(plan: {
    days: Array<{
      day: number;
      destinationId?: string;
      destinationName?: string;
      items: Array<{
        placeId: string;
        placeName: string;
        timeBlock: string;
        entryFee?: { amount?: number } | null;
        openingHours?: string | null;
      }>;
    }>;
    interCityTravel?: Array<{
      fromDestinationId: string;
      toDestinationId: string;
      status: string;
      distanceKm: number | null;
      durationMinutes: number | null;
    }>;
  }): Promise<ItinerarySnapshot> {
    const items: SnapshotItem[] = plan.days.flatMap((day) =>
      day.items.map((item) => ({
        placeId: item.placeId,
        placeName: item.placeName,
        day: day.day,
        timeBlock: item.timeBlock as SnapshotItem["timeBlock"],
        destinationId: day.destinationId,
        destinationName: day.destinationName,
        entryFeeAmount: item.entryFee?.amount ?? null,
        openingHours: item.openingHours ?? null
      }))
    );
    return {
      tripId: null,
      generatedAt: new Date().toISOString(),
      destinations: Array.from(
        new Map(
          plan.days
            .filter((d) => d.destinationId)
            .map((d) => [d.destinationId!, { id: d.destinationId!, name: d.destinationName ?? "" }])
        ).values()
      ),
      days: Array.from(new Set(plan.days.map((d) => d.day))).sort((a, b) => a - b),
      items,
      interCityLegs: plan.interCityTravel
    };
  }

  /** Loads an OWN saved trip into snapshot form via the existing TripService. */
  async buildSnapshotFromTrip(
    tripId: string,
    user: AuthenticatedUser
  ): Promise<ItinerarySnapshot | null> {
    try {
      const trip = await this.tripsSvc.getTripById(tripId, user.id); // ownership enforced
      const items: SnapshotItem[] = [];
      const destinations: Array<{ id: string; name: string }> = [];
      let dayNumber = 1;
      for (const item of trip.items) {
        let name = item.notes ?? "Saved stop";
        let category: string | undefined;
        if (item.attraction_id) {
          const att = await this.tourService
            .getAttractions(item.destination_id ?? "")
            .catch(() => []);
          const found = (att as Array<{ id: string; name: string; category?: string }>).find(
            (a) => a.id === item.attraction_id
          );
          if (found) {
            name = found.name;
            category = found.category;
          }
        }
        if (item.destination_id && !destinations.some((d) => d.id === item.destination_id)) {
          destinations.push({ id: item.destination_id, name: name });
        }
        items.push({
          placeId: item.attraction_id ?? `${item.id}`,
          placeName: name,
          category,
          destinationId: item.destination_id ?? undefined,
          day: Math.min(dayNumber++, 365),
          timeBlock: (item.start_time && parseInt(item.start_time, 10) >= 13
            ? "afternoon"
            : "morning") as SnapshotItem["timeBlock"]
        });
      }
      return {
        tripId: trip.id,
        generatedAt: trip.created_at,
        destinations,
        days: Array.from(new Set(items.map((i) => i.day))).sort((a, b) => a - b),
        items
      };
    } catch {
      return null; // cross-user / not found → no snapshot, no leakage
    }
  }

  // ---------------------------------------------------------------------
  // Request-scoped baseline (public users): fresh deterministic itinerary
  // built from verified records via the EXISTING filter + sequencer.
  // ---------------------------------------------------------------------
  async buildRequestScopedSnapshot(
    destinationName: string,
    entities: ExtractedEntities
  ): Promise<{ snapshot: ItinerarySnapshot | null; sources: ProvenanceSource[] }> {
    const sources: ProvenanceSource[] = [];
    try {
      const search = await this.tourService.getDestinations({
        search: destinationName,
        pageSize: 1
      });
      if (!search.destinations.length) return { snapshot: null, sources };
      const dest = search.destinations[0];
      sources.push({ type: "database", provider: "Supabase", resource: "destinations" });

      const [attractions, experiences, businesses] = await Promise.all([
        this.tourService.getAttractions(dest.id).catch(() => []),
        this.tourService.getExperiences(dest.id).catch(() => []),
        this.tourService.getLocalBusinesses(dest.id).catch(() => [])
      ]);
      sources.push({ type: "database", provider: "Supabase", resource: "attractions" });

      const candidates = this.filter.filterAndNormalize(
        {
          destination: dest,
          attractions: attractions as never[],
          experiences: experiences as never[],
          localBusinesses: (businesses ?? []).slice(0, 2) as never[]
        },
        entities
      );
      const days = await this.sequencer.sequenceItinerary(candidates, entities, null);
      const snapshot = await this.buildSnapshotFromPlan({
        days: days.map((d) => ({
          day: d.day,
          destinationId: dest.id,
          destinationName: dest.name,
          items: d.items.map((i) => ({
            placeId: i.placeId,
            placeName: i.placeName,
            timeBlock: i.timeBlock,
            entryFee: i.entryFee ?? null,
            openingHours: i.openingHours ?? null
          }))
        }))
      });
      snapshot.destinations = [{ id: dest.id, name: dest.name }];
      for (const item of snapshot.items) item.destinationId = dest.id;
      return { snapshot, sources };
    } catch {
      return { snapshot: null, sources };
    }
  }

  /**
   * Phase 8D apply path — persists CONFIRMED proposals to an OWNED saved trip
   * exclusively through the existing TripService (ownership + RLS preserved).
   */
  async applyToTrip(
    tripId: string,
    user: AuthenticatedUser,
    proposedChanges: Array<{
      action: string;
      affectedPlaceId: string;
      replacementPlaceId?: string;
      newTimeBlock?: string;
    }>
  ): Promise<{ appliedCount: number; warnings: string[] }> {
    const warnings: string[] = [];
    let appliedCount = 0;
    try {
      const trip = await this.tripsSvc.getTripById(tripId, user.id); // ownership enforced
      for (const change of proposedChanges) {
        const matchingRow = trip.items.find((i) => i.attraction_id === change.affectedPlaceId);
        if (!matchingRow && change.action !== "replace_item") {
          warnings.push(`No saved itinerary item matched "${change.affectedPlaceId}"; skipped.`);
          continue;
        }
        try {
          if (change.action === "replace_item" && change.replacementPlaceId) {
            if (matchingRow) {
              await this.tripsSvc.updateItineraryItem(tripId, matchingRow.id, user.id, {
                attractionId: change.replacementPlaceId
              });
            } else {
              await this.tripsSvc.addItineraryItem(tripId, user.id, {
                attractionId: change.replacementPlaceId
              });
            }
            appliedCount++;
          } else if (change.action === "reschedule_item" && matchingRow) {
            const time =
              change.newTimeBlock === "afternoon"
                ? "14:00"
                : change.newTimeBlock === "evening"
                  ? "18:00"
                  : "09:00";
            await this.tripsSvc.updateItineraryItem(tripId, matchingRow.id, user.id, {
              startTime: time
            });
            appliedCount++;
          } else if (change.action === "remove_item" && matchingRow) {
            await this.tripsSvc.deleteItineraryItem(tripId, matchingRow.id, user.id);
            appliedCount++;
          }
        } catch (err) {
          logger.warn({ err }, "A confirmed adaptation could not be applied");
          warnings.push("One confirmed change could not be applied; the rest were attempted.");
        }
      }
    } catch {
      warnings.push("Trip access was denied or the trip does not exist. Nothing was modified.");
    }
    return { appliedCount, warnings };
  }

  // ---------------------------------------------------------------------
  // Main adaptation flow (assess + suggest; never persists)
  // ---------------------------------------------------------------------
  async adapt(input: {
    snapshot: ItinerarySnapshot;
    entities: ExtractedEntities;
    travellerContext: TravellerContext;
    constraintResolution: ConstraintResolution;
    triggers: ReturnType<AdaptiveItineraryService["parseTriggers"]>;
    mode?: AdaptationMode;
  }): Promise<AdaptationResultDto> {
    const { snapshot, travellerContext: ctx } = input;
    const warnings: string[] = [];
    const unknowns: string[] = [];
    const sources: ProvenanceSource[] = [];

    // ---- Current conditions (memoized per destination; failures → unavailable)
    const destIds = Array.from(
      new Set(snapshot.items.map((i) => i.destinationId).filter((d): d is string => Boolean(d)))
    );
    const weatherByDestination: Record<
      string,
      Awaited<ReturnType<WeatherService["getDestinationWeather"]>> | null
    > = {};
    const crowdByDestination: Record<
      string,
      { level?: string | null; confidence?: string | null; rushFreeHours?: string | null } | null
    > = {};
    const safetyByDestination: Record<
      string,
      { activeAlerts?: number; seriousRecentIncidents?: number; dataQualityStatus?: string } | null
    > = {};

    for (const destId of destIds) {
      // Weather only when a weather trigger or always-relevant outdoor check
      const weather = await this.wthrService.getDestinationWeather(destId).catch(() => null);
      weatherByDestination[destId] = weather;
      if (!weather)
        unknowns.push(
          "Live weather is currently unavailable for one or more destinations; no weather-based adjustments were invented."
        );

      if (
        input.triggers.userConstraintTriggers.some((t) => t.type === "preference") ||
        ctx.preferences.avoidCrowds.value === true
      ) {
        const [crowd, destRow] = await Promise.all([
          this.crwdService.getCrowdAssessment(destId, input.entities.startDate).catch(() => null),
          this.tourService.getDestinationById(destId).catch(() => null)
        ]);
        crowdByDestination[destId] = crowd
          ? {
              level: crowd.crowd.level,
              confidence: crowd.crowd.confidence,
              // Verified rush metadata from the destination record enables
              // Tier-1 time-shift proposals:
              rushFreeHours: destRow?.rush_free_hours ?? null
            }
          : null;
        if (!crowd) unknowns.push("Crowd assessment is unavailable for one or more destinations.");
        else sources.push(...crowd.sources);
      }

      if (ctx.safetyContext.womenSafetyRelevant.value === true) {
        const ws = await this.wsSafety
          .getWomenSafetyAssessment(destId, input.entities.startDate)
          .catch(() => null);
        safetyByDestination[destId] = ws
          ? {
              activeAlerts: ws.warnings?.length ?? 0,
              seriousRecentIncidents: 0, // incident details live inside the assessment payload
              dataQualityStatus: ws.dataQuality?.status
            }
          : null;
        if (!ws)
          unknowns.push(
            "Women-safety assessment is unavailable; existing safety context retained without claims."
          );
        else sources.push(...ws.sources);
      }
    }

    // ---- Detect changes (deterministic)
    const changes: DetectedChange[] = this.detector.detectChanges(snapshot, {
      weatherByDestination,
      crowdByDestination,
      safetyByDestination,
      routingChanges: snapshot.interCityLegs?.filter((l) => l.status !== "available"),
      userConstraintTriggers: input.triggers.userConstraintTriggers
    });

    if (changes.length === 0) {
      return {
        adaptationMode: input.mode ?? "assess_only",
        tripId: snapshot.tripId,
        changesDetected: [],
        proposedChanges: [],
        preservedItems: snapshot.items.map((i) => ({
          day: i.day,
          placeId: i.placeId,
          placeName: i.placeName
        })),
        updatedItinerary: null,
        warnings: ["No relevant condition changes were verified against the current itinerary."],
        unknowns,
        sources
      };
    }

    // ---- Candidate pools ONLY for affected destinations (performance contract)
    const affectedDestinations = Array.from(
      new Set(changes.map((c) => c.affectedDestinationId).filter((d): d is string => Boolean(d)))
    );
    void warnings;
    const candidatesByDestination: Record<
      string,
      Awaited<ReturnType<CandidateFilter["filterAndNormalize"]>>
    > = {};
    for (const destId of affectedDestinations) {
      const [attractions, experiences] = await Promise.all([
        this.tourService.getAttractions(destId).catch(() => []),
        this.tourService.getExperiences(destId).catch(() => [])
      ]);
      candidatesByDestination[destId] = this.filter.filterAndNormalize(
        { attractions: attractions as never[], experiences: experiences as never[] },
        input.entities
      );
      sources.push({ type: "database", provider: "Supabase", resource: `destinations/${destId}` });
    }

    // ---- Minimal-change partial replanning
    const result = this.replanner.replan({
      snapshot,
      changes,
      candidatesByDestination,
      travellerContext: ctx,
      constraintResolution: input.constraintResolution
    });

    const mode: AdaptationMode = input.mode ?? "suggest_adjustments";
    return {
      adaptationMode: mode,
      tripId: snapshot.tripId,
      changesDetected: changes,
      proposedChanges: result.proposedChanges,
      preservedItems: result.preservedItems,
      updatedItinerary: result.updatedItinerary,
      warnings: [...result.warnings, ...warnings],
      unknowns,
      sources
    };
  }
}

export const adaptiveItineraryService = new AdaptiveItineraryService();
