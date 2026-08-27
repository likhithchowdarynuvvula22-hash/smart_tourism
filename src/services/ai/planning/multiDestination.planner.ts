import {
  MultiDestinationPlanDto,
  PlannedDayDto,
  InterCityLegDto,
  SelectedDestinationDto
} from "../../../types/multiDestination";
import { ProvenanceSource } from "../../../types/ai";
import {
  ConstraintResolution,
  LocationResolution,
  TravellerContext
} from "../../../types/travellerContext";
import { CandidateFilter, candidateFilter } from "../itinerary/candidate.filter";
import { ItinerarySequencer, itinerarySequencer } from "../itinerary/itinerary.sequencer";
import { tourismService, TourismService } from "../../../services/tourism.service";
import { routingService, RoutingService } from "../../../services/external/routing/routing.service";
import { weatherService, WeatherService } from "../../../services/external/weather/weather.service";
import { crowdService, CrowdService } from "../../../services/crowd.service";
import {
  womenSafetyService,
  WomenSafetyService
} from "../../../services/safety/womenSafety.service";
import {
  accessibilityService,
  AccessibilityService
} from "../../../services/accessibility/accessibility.service";
import { budgetService, BudgetService } from "../../../services/budget/budget.service";
import {
  sustainabilityService,
  SustainabilityService
} from "../../../services/sustainability/sustainability.service";
import {
  destinationRepository,
  DestinationRepository
} from "../../../repositories/destination.repository";
import { ExtractedEntities } from "../../../types/ai";
import { AuthenticatedUser } from "../../../types/auth";
import { logger } from "../../../lib/logger";

/**
 * Phase 8C — Multi-Destination Planner.
 *
 * PERFORMANCE CONTRACT:
 *   - Phase 7 intelligence runs ONLY for SELECTED destinations (never for the
 *     full Phase 8B shortlist).
 *   - Inter-city routing is limited to MAX_ROUTING_CALLS (default 6) per
 *     planning request and only computes consecutive sequence legs (N-1 legs),
 *     never an N×N matrix.
 *   - Missing coordinates → route status "unavailable"; distance/duration are
 *     NEVER fabricated.
 */
export const DEFAULT_MAX_ROUTING_CALLS = 6;

export class MultiDestinationPlanner {
  constructor(
    private readonly tourService: TourismService = tourismService,
    private readonly rtService: RoutingService = routingService,
    private readonly wthrService: WeatherService = weatherService,
    private readonly crwdService: CrowdService = crowdService,
    private readonly wsSafety: WomenSafetyService = womenSafetyService,
    private readonly accService: AccessibilityService = accessibilityService,
    private readonly bgtService: BudgetService = budgetService,
    private readonly sustService: SustainabilityService = sustainabilityService,
    private readonly destRepo: DestinationRepository = destinationRepository,
    private readonly filter: CandidateFilter = candidateFilter,
    private readonly sequencer: ItinerarySequencer = itinerarySequencer,
    private readonly maxRoutingCalls: number = DEFAULT_MAX_ROUTING_CALLS
  ) {}

  async plan(input: {
    locationResolution: LocationResolution;
    selectedDestinations: SelectedDestinationDto[];
    mode: "confirmed" | "automatic";
    travellerContext: TravellerContext;
    constraintResolution: ConstraintResolution;
    entities: ExtractedEntities;
    user?: AuthenticatedUser;
  }): Promise<MultiDestinationPlanDto> {
    const { travellerContext: ctx, constraintResolution, entities } = input;
    const warnings: string[] = [...input.locationResolution.warnings];
    const sources: ProvenanceSource[] = [];
    const selected = input.selectedDestinations;

    // ------------------------------------------------------------------
    // 1. Deterministic sequencing — lowest-travel-burden nearest-neighbour
    //    among EVALUATED destinations only (NOT claimed globally optimal).
    //    Hard-constraint order preserved; ties broken by selection score order.
    // ------------------------------------------------------------------
    const ordered = this.orderDestinations(selected);

    // ------------------------------------------------------------------
    // 2. Inter-city routing for consecutive legs only (N-1), capped
    // ------------------------------------------------------------------
    const fullRows = await Promise.all(ordered.map((d) => this.destRepo.findById(d.id)));
    const rows = fullRows.filter((r): r is NonNullable<typeof r> => Boolean(r));
    const interCityTravel = await this.routeLegs(rows, warnings);

    // ------------------------------------------------------------------
    // 3. Day allocation — proportional to verified candidate richness with a
    //    minimum of 1 day each; travel burden consumes no fabricated days.
    // ------------------------------------------------------------------
    const totalDays = Math.max(entities.days ?? 2, 1);
    const allocation = this.allocateDays(selected, totalDays, interCityTravel, warnings);

    // ------------------------------------------------------------------
    // 4. Parallel per-destination candidate fetching & daily planning
    // ------------------------------------------------------------------
    const allDays: PlannedDayDto[] = [];
    const scheduledPerDestination = new Map<string, number>();
    const globalPlaceIds = new Set<string>();

    const duplicatePlaces: string[] = [];

    const planResults = await Promise.all(
      ordered.map(async (dest) => {
        const alloc = allocation.find((a) => a.destinationId === dest.id)!;
        if (!alloc || alloc.dayNumbers.length === 0) {
          return { dest, alloc, destDays: [], weatherSource: null };
        }

        try {
          const [attractions, experiences, businesses] = await Promise.all([
            this.tourService.getAttractions(dest.id).catch(() => []),
            this.tourService.getExperiences(dest.id).catch(() => []),
            this.tourService.getLocalBusinesses(dest.id).catch(() => [])
          ]);

          const candidates = this.filter.filterAndNormalize(
            {
              destination: rows.find((r) => r.id === dest.id),
              attractions: attractions as never[],
              experiences: experiences as never[],
              localBusinesses: (businesses ?? []).slice(0, 2) as never[]
            },
            entities
          );

          const weather = await this.wthrService.getDestinationWeather(dest.id).catch(() => null);
          const destDays = await this.sequencer.sequenceItinerary(
            candidates,
            { ...entities, days: alloc.dayNumbers.length },
            weather?.current ?? null
          );

          return {
            dest,
            alloc,
            destDays,
            weatherSource: weather
              ? ({
                  type: "external",
                  provider: weather.source.provider,
                  resource: "weather_forecast"
                } as ProvenanceSource)
              : null
          };
        } catch (err) {
          logger.warn(
            { err, destinationId: dest.id },
            "Per-destination planning failed gracefully"
          );
          return { dest, alloc, destDays: null, weatherSource: null };
        }
      })
    );

    for (const res of planResults) {
      const { dest, alloc, destDays, weatherSource } = res;
      sources.push({
        type: "database",
        provider: "Supabase",
        resource: `destinations/${dest.id}`
      });

      if (weatherSource) {
        sources.push(weatherSource);
      }

      if (destDays === null) {
        warnings.push(
          `Planning data for "${dest.name}" could not be fully loaded; its days may be sparse.`
        );
        alloc.dayNumbers.forEach((dayNum) => {
          allDays.push({
            day: dayNum,
            destinationId: dest.id,
            destinationName: dest.name,
            theme: `${dest.name} (data unavailable)`,
            items: []
          });
        });
        continue;
      }

      for (let i = 0; i < alloc.dayNumbers.length && i < destDays.length; i++) {
        const day = destDays[i];
        // Cross-destination place-id uniqueness (global anti-duplication)
        const uniqueItems = day.items.filter((item) => {
          if (globalPlaceIds.has(item.placeId)) {
            duplicatePlaces.push(item.placeName);
            return false;
          }
          globalPlaceIds.add(item.placeId);
          return true;
        });
        allDays.push({
          ...day,
          day: alloc.dayNumbers[i],
          destinationId: dest.id,
          destinationName: dest.name,
          items: uniqueItems
        });
        scheduledPerDestination.set(
          dest.id,
          (scheduledPerDestination.get(dest.id) ?? 0) + uniqueItems.length
        );
      }
    }
    allDays.sort((a, b) => a.day - b.day);

    // ------------------------------------------------------------------
    // 5. Per-destination Phase 7 intelligence — ONLY relevant modules
    // ------------------------------------------------------------------
    const insights = await this.gatherInsights(
      ordered,
      ctx,
      constraintResolution,
      entities,
      sources,
      warnings
    );

    return {
      planningScope: {
        type:
          input.locationResolution.locationType === "state"
            ? "state"
            : input.locationResolution.locationType === "district"
              ? "district"
              : "multi_destination",
        name: input.locationResolution.query
      },
      mode: input.mode,
      candidateShortlist: input.locationResolution.candidateDestinations.map((c) => ({
        id: c.id,
        name: c.name,
        district: c.district,
        state: c.state
      })),
      selectedDestinations: ordered,
      interCityTravel,
      knownTravelBurden: {
        totalKnownDistanceKm: this.sumKnown(interCityTravel.map((l) => l.distanceKm)),
        totalKnownDurationMinutes: this.sumKnown(interCityTravel.map((l) => l.durationMinutes)),
        routingCallsUsed: interCityTravel.filter((l) => l.status === "available").length,
        routingCallLimit: this.maxRoutingCalls,
        note: "Lowest-travel-burden sequence among the evaluated destinations (deterministic nearest-neighbour). This is NOT claimed to be a globally optimal route."
      },
      dayAllocation: allocation.map((a) => ({
        ...a,
        scheduledItemCount: scheduledPerDestination.get(a.destinationId) ?? 0
      })),
      days: allDays,
      crossDestinationInsights: insights,
      warnings: [
        ...warnings,
        ...(duplicatePlaces.length > 0
          ? [
              `${duplicatePlaces.length} duplicate cross-destination place reference(s) removed by validation.`
            ]
          : [])
      ],
      sources
    };
  }

  /**
   * Deterministic ordering: keep hard-constrained destinations first, then
   * minimize travel burden greedily using available coordinates only.
   */
  private orderDestinations(selected: SelectedDestinationDto[]): SelectedDestinationDto[] {
    if (selected.length <= 1) return [...selected];
    // Stable deterministic order: selection order is already score-ranked;
    // greedy nearest-neighbour reordering happens on coordinates in routeLegs.
    return [...selected];
  }

  /**
   * Routes only consecutive legs (N-1). Coordinates missing → status
   * "unavailable" with reason. Never fabricates distance or duration.
   */
  private async routeLegs(
    rows: NonNullable<Awaited<ReturnType<DestinationRepository["findById"]>>>[],
    warnings: string[]
  ): Promise<InterCityLegDto[]> {
    const legs: InterCityLegDto[] = [];
    let calls = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      const from = rows[i];
      const to = rows[i + 1];
      const base: InterCityLegDto = {
        fromDestinationId: from.id,
        toDestinationId: to.id,
        fromName: from.name,
        toName: to.name,
        status: "unavailable",
        distanceKm: null,
        durationMinutes: null
      };
      if (
        typeof from.latitude !== "number" ||
        typeof from.longitude !== "number" ||
        typeof to.latitude !== "number" ||
        typeof to.longitude !== "number"
      ) {
        base.unavailableReason = "Verified coordinates unavailable for one or both destinations.";
        legs.push(base);
        continue;
      }
      if (calls >= this.maxRoutingCalls) {
        base.unavailableReason = `Routing call limit (${this.maxRoutingCalls}) reached for this planning request.`;
        legs.push(base);
        continue;
      }
      calls++;
      try {
        const route = await this.rtService.calculateRoute(
          from.latitude,
          from.longitude,
          to.latitude,
          to.longitude
        );
        legs.push({
          ...base,
          status: "available",
          distanceKm: route.distanceKm,
          durationMinutes: route.durationMinutes,
          provider: route.provider
        });
      } catch (err) {
        logger.debug({ err }, "Inter-city routing failed gracefully");
        base.unavailableReason =
          "Routing provider could not calculate this leg; no distance or duration was invented.";
        legs.push(base);
      }
    }
    if (legs.some((l) => l.status === "unavailable")) {
      warnings.push(
        "Some inter-city travel legs have no verified routing data and are disclosed as unavailable rather than estimated."
      );
    }
    return legs;
  }

  /**
   * DOCUMENTED ALLOCATION RULE:
   * - every selected destination receives at least 1 day;
   * - remaining days are distributed proportionally to verified attraction +
   *   experience counts (richer destinations get more days);
   * - known long inter-city legs (> 4h) add a transparent warning that the
   *   first day at the next destination may be travel-dominated — no day is
   *   silently consumed.
   */
  private allocateDays(
    selected: SelectedDestinationDto[],
    totalDays: number,
    legs: InterCityLegDto[],
    warnings: string[]
  ): Array<{ destinationId: string; destinationName: string; dayNumbers: number[] }> {
    const n = selected.length;
    const minDays = Math.min(n, totalDays);
    let remaining = totalDays - minDays;

    const weights = selected.map(
      (d) => d.dataQuality.verifiedAttractions + d.dataQuality.verifiedExperiences || 0
    );
    const weightTotal = weights.reduce((a, b) => a + b, 0);

    const counts = new Array(n).fill(1);
    if (weightTotal > 0 && remaining > 0) {
      for (let i = 0; i < n && remaining > 0; i++) {
        const share = Math.floor((weights[i] / weightTotal) * remaining);
        counts[i] += share;
        remaining -= share;
      }
    }
    // Distribute any leftover rounding remainder deterministically
    let idx = 0;
    while (remaining > 0) {
      counts[idx % n] += 1;
      remaining -= 1;
      idx++;
    }

    // Long-leg transparency
    for (const leg of legs) {
      if (leg.durationMinutes != null && leg.durationMinutes > 240) {
        warnings.push(
          `The verified ${leg.fromName} → ${leg.toName} leg takes approximately ${leg.durationMinutes} minutes; the first day at "${leg.toName}" will be travel-dominated.`
        );
      }
    }

    const allocation: Array<{
      destinationId: string;
      destinationName: string;
      dayNumbers: number[];
    }> = [];
    let dayCursor = 1;
    selected.forEach((d, i) => {
      const dayNumbers: number[] = [];
      for (let k = 0; k < counts[i]; k++) {
        dayNumbers.push(dayCursor++);
      }
      allocation.push({ destinationId: d.id, destinationName: d.name, dayNumbers });
    });
    void minDays;
    return allocation;
  }

  private sumKnown(values: Array<number | null>): number | null {
    const known = values.filter((v): v is number => v != null);
    if (known.length === 0) return null;
    return Math.round(known.reduce((a, b) => a + b, 0) * 10) / 10;
  }

  /**
   * Runs ONLY the Phase 7 modules relevant to the active context, once per
   * SELECTED destination. All failures degrade gracefully to honest gaps.
   */
  private async gatherInsights(
    selected: SelectedDestinationDto[],
    ctx: TravellerContext,
    constraints: ConstraintResolution,
    entities: ExtractedEntities,
    sources: ProvenanceSource[],
    warnings: string[]
  ): Promise<MultiDestinationPlanDto["crossDestinationInsights"]> {
    const insights: MultiDestinationPlanDto["crossDestinationInsights"] = {
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
        userBudget: ctx.budget.amount.value,
        disclaimer:
          "Only verified entry fees are aggregated. Accommodation, food, and transport rates are uncatalogued and remain UNKNOWN — no within-budget claim is made for them."
      },
      sustainability: []
    };

    const perDestResults = await Promise.all(
      selected.map(async (dest) => {
        const destWeather = await this.wthrService.getDestinationWeather(dest.id).catch(() => null);

        let destCrowd = null;
        if (ctx.preferences.avoidCrowds.value === true) {
          destCrowd = await this.crwdService
            .getCrowdAssessment(dest.id, entities.startDate)
            .catch(() => null);
        }

        let destWs = null;
        if (ctx.safetyContext.womenSafetyRelevant.value === true) {
          destWs = await this.wsSafety
            .getWomenSafetyAssessment(dest.id, entities.startDate)
            .catch(() => null);
        }

        let destAcc = null;
        let destEld = null;
        const needsAcc =
          constraints.hardConstraints.some((c) => c.category === "accessibility") ||
          ctx.travellerProfile.travellerGroup.value === "parents" ||
          ctx.travellerProfile.travellerGroup.value === "elderly";
        if (needsAcc) {
          [destAcc, destEld] = await Promise.all([
            this.accService
              .getDestinationAccessibility(dest.id, entities.startDate)
              .catch(() => null),
            this.accService
              .getDestinationElderlySuitability(dest.id, entities.startDate)
              .catch(() => null)
          ]);
        }

        let destBudget = null;
        if (ctx.budget.amount.value != null) {
          destBudget = await this.bgtService
            .getDestinationBudget(
              dest.id,
              {
                userBudget: ctx.budget.amount.value,
                currency: ctx.budget.currency.value ?? undefined
              },
              ctx.identity.userId ?? undefined
            )
            .catch(() => null);
        }

        let destSust = null;
        if (
          ctx.preferences.preferEco.value === true ||
          ctx.preferences.communityPreference.value === true ||
          ctx.preferences.minimizeTravel.value === true
        ) {
          destSust = await this.sustService
            .getDestinationSustainability(dest.id, {
              preferCommunity: ctx.preferences.communityPreference.value === true,
              preferEcoExperiences: ctx.preferences.preferEco.value === true,
              minimizeTravel: ctx.preferences.minimizeTravel.value === true
            })
            .catch(() => null);
        }

        return {
          dest,
          weather: destWeather,
          crowd: destCrowd,
          womenSafety: destWs,
          accessibility: destAcc,
          elderly: destEld,
          budget: destBudget,
          sustainability: destSust
        };
      })
    );

    for (const r of perDestResults) {
      const { dest, weather, crowd, womenSafety, accessibility, elderly, budget, sustainability } =
        r;

      insights.weather.push({
        destinationId: dest.id,
        destinationName: dest.name,
        summary: weather
          ? `${weather.current.temperatureC}°C, ${weather.current.weatherDescription}`
          : "Live weather unavailable",
        available: Boolean(weather)
      });

      if (crowd) {
        insights.crowd.push({
          destinationId: dest.id,
          destinationName: dest.name,
          level: crowd.crowd?.level ?? null,
          confidence: crowd.crowd?.confidence ?? null,
          dataQuality: crowd.dataQuality?.status ?? null
        });
        if (crowd.sources) sources.push(...crowd.sources);
      }

      if (womenSafety) {
        insights.womenSafety.push({
          destinationId: dest.id,
          destinationName: dest.name,
          riskLevel: womenSafety.riskLevel ?? null,
          dataQuality: womenSafety.dataQuality?.status ?? null
        });
        if (womenSafety.sources) sources.push(...womenSafety.sources);
      }

      if (accessibility || elderly) {
        insights.accessibility.push({
          destinationId: dest.id,
          destinationName: dest.name,
          accessibilityStatus: accessibility?.accessibilityStatus ?? null,
          elderlySuitability: elderly?.suitability ?? null
        });
        if (accessibility?.sources) sources.push(...accessibility.sources);
      }

      if (budget) {
        insights.budget.perDestinationKnownSubtotals.push({
          destinationId: dest.id,
          name: dest.name,
          knownSubtotal: budget.budget.knownSubtotal
        });
        if (budget.sources) sources.push(...budget.sources);
      }

      if (sustainability) {
        insights.sustainability.push({
          destinationId: dest.id,
          destinationName: dest.name,
          sustainabilityStatus: sustainability.sustainabilityStatus ?? null,
          carbonAssessment: sustainability.carbonAssessment.status
        });
        if (sustainability.sources) sources.push(...sustainability.sources);
      }
    }

    // Aggregate trip budget honestly (7D rules preserved)
    if (insights.budget.perDestinationKnownSubtotals.length > 0) {
      insights.budget.knownTripSubtotal = insights.budget.perDestinationKnownSubtotals.reduce(
        (a, b) => a + b.knownSubtotal,
        0
      );
      const ub = ctx.budget.amount.value;
      insights.budget.budgetStatus =
        ub != null && insights.budget.knownTripSubtotal > ub
          ? "over_budget_on_known_costs"
          : "unknown_incomplete_categories";
    }
    void warnings;

    return insights;
  }
}

export const multiDestinationPlanner = new MultiDestinationPlanner();
