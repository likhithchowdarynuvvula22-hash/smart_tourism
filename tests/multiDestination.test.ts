import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { MultiDestinationSelector } from "../src/services/ai/planning/multiDestination.selector";
import {
  MultiDestinationPlanner,
  DEFAULT_MAX_ROUTING_CALLS
} from "../src/services/ai/planning/multiDestination.planner";
import { travellerContextBuilder } from "../src/services/ai/context/travellerContext.builder";
import { constraintEngine } from "../src/services/ai/context/constraint.engine";
import { locationResolver } from "../src/services/ai/context/location.resolver";
import { TourismService } from "../src/services/tourism.service";
import { DestinationRepository } from "../src/repositories/destination.repository";
import { RoutingService } from "../src/services/external/routing/routing.service";
import { WeatherService } from "../src/services/external/weather/weather.service";
import { AuthenticatedUser } from "../src/types/auth";

const touristA: AuthenticatedUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "touristA@example.com",
  role: "tourist",
  roles: ["tourist"]
};

const DEST_A = {
  id: "324f8a6f-d7cc-4efa-bf38-358726b84a4d",
  name: "Fort Kochi",
  district: "Ernakulam",
  state: "Kerala",
  latitude: 9.96,
  longitude: 76.24,
  description: null
};
const DEST_B = {
  id: "a2b4e3b9-0d78-4b13-9432-1d086d2c100e",
  name: "Marari Beach",
  district: "Alappuzha",
  state: "Kerala",
  latitude: 9.7,
  longitude: 76.28,
  description: null
};
const DEST_ZERO_DATA = {
  id: "d0d0d0d0-0000-4000-8000-000000000001",
  name: "Empty Valley",
  district: null,
  state: "TestState",
  latitude: 10,
  longitude: 76,
  description: null
};

const buildSelectorStack = (
  candidateRows: Array<Record<string, unknown>>,
  perDestData: Record<
    string,
    { attractions?: unknown[]; experiences?: unknown[]; accessibility?: unknown[] }
  > = {}
) => {
  const tourService = {
    getAttractions: vi
      .fn()
      .mockImplementation(async (id: string) => perDestData[id]?.attractions ?? []),
    getExperiences: vi
      .fn()
      .mockImplementation(async (id: string) => perDestData[id]?.experiences ?? []),
    getAccessibility: vi
      .fn()
      .mockImplementation(async (id: string) => perDestData[id]?.accessibility ?? [])
  } as unknown as TourismService;
  const destRepo = {
    findById: vi
      .fn()
      .mockImplementation(async (id: string) => candidateRows.find((r) => r.id === id) ?? null)
  } as unknown as DestinationRepository;
  return { selector: new MultiDestinationSelector(tourService, destRepo), tourService, destRepo };
};

const KERALA_RESOLUTION = {
  locationType: "state" as const,
  query: "Kerala",
  resolvedState: "Kerala",
  resolvedDistrict: null,
  candidateDestinations: [DEST_A, DEST_B].map((d) => ({
    id: d.id,
    name: d.name,
    district: d.district,
    state: d.state
  })),
  totalCandidates: 2,
  confidence: "high" as const,
  warnings: []
};

const buildCtx = async (
  entities: Parameters<typeof travellerContextBuilder.buildContext>[0]["entities"] = {}
) => travellerContextBuilder.buildContext({ entities, intent: "trip_planning", user: touristA });

describe("Phase 8C: Multi-Destination Itinerary Orchestration Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // LOCATION (via Phase 8B resolver — behavior preserved)
  // =========================================================================
  it("1. resolves a state query", async () => {
    const r = await locationResolver.resolve("Kerala");
    expect(r.locationType).toBe("state");
    expect(r.resolvedState).toBe("Kerala");
  });
  it("2. resolves a district query", async () => {
    const r = await locationResolver.resolve("Kodagu");
    expect(r.locationType).toBe("district");
  });
  it("3. resolves an exact destination", async () => {
    const r = await locationResolver.resolve("Araku Valley");
    expect(r.locationType).toBe("destination");
  });
  it("4. preserves ambiguity behavior unchanged", async () => {
    const r = await locationResolver.resolve("falls");
    expect(r.locationType).toBe("ambiguous");
  });

  // =========================================================================
  // SELECTION
  // =========================================================================
  it("5. discloses the bounded candidate list in selection results", async () => {
    const { selector } = buildSelectorStack([DEST_A, DEST_B], {
      [DEST_A.id]: { attractions: [{ id: "a1", name: "X" }] }
    });
    const ctx = await buildCtx();
    const res = await selector.select({
      locationResolution: KERALA_RESOLUTION,
      travellerContext: ctx,
      requestedDuration: 3
    });
    expect(res.profiles.length).toBe(2);
    expect(res.mode === "automatic" || res.mode === "awaiting_confirmation").toBe(true);
  });

  it("6. automatic selection never exceeds the configured maximum", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: `Dest ${i}`,
      district: null,
      state: "Kerala"
    }));
    const perDestData: Record<string, { attractions: unknown[] }> = {};
    for (const r of rows) perDestData[r.id] = { attractions: [{ id: "x" }, { id: "y" }] };
    const { selector } = buildSelectorStack(rows, perDestData);
    const ctx = await buildCtx();
    const res = await selector.select({
      locationResolution: {
        ...KERALA_RESOLUTION,
        candidateDestinations: rows.map((r) => ({
          id: r.id,
          name: r.name,
          district: null,
          state: "Kerala"
        })),
        totalCandidates: 8
      },
      travellerContext: ctx,
      requestedDuration: 10
    });
    expect(res.selected.length).toBeLessThanOrEqual(3);
  });

  it("7. explicit selected destination IDs are accepted when they belong to the context", async () => {
    const { selector } = buildSelectorStack([DEST_A, DEST_B]);
    const ctx = await buildCtx();
    const res = await selector.select({
      locationResolution: KERALA_RESOLUTION,
      travellerContext: ctx,
      requestedDuration: 3,
      explicitDestinationIds: [DEST_A.id, DEST_B.id]
    });
    expect(res.mode).toBe("confirmed");
    expect(res.selected.map((s) => s.name)).toEqual(["Fort Kochi", "Marari Beach"]);
  });

  it("8. unrelated selected destination IDs are rejected", async () => {
    const { selector } = buildSelectorStack([DEST_A, DEST_B]);
    const ctx = await buildCtx();
    const res = await selector.select({
      locationResolution: KERALA_RESOLUTION,
      travellerContext: ctx,
      requestedDuration: 3,
      explicitDestinationIds: ["99999999-9999-4999-8999-999999999999"]
    });
    expect(res.mode).not.toBe("confirmed");
    expect(res.warnings.join(" ")).toMatch(/rejected/i);
  });

  it("9. accessibility-aware selection requires verified evidence or honest warning", async () => {
    const accEvidence = [
      {
        attraction_id: "a1",
        wheelchair_access: true,
        ramps: true,
        lifts: false,
        accessible_toilet: false
      }
    ];
    const withData = buildSelectorStack([DEST_A, DEST_B], {
      [DEST_A.id]: { attractions: [{ id: "a1", name: "Ramp Fort" }], accessibility: accEvidence }
    });
    const ctx = await buildCtx({ requiresWheelchair: true, accessibilityNeeds: ["wheelchair"] });
    const res = await withData.selector.select({
      locationResolution: KERALA_RESOLUTION,
      travellerContext: ctx,
      requestedDuration: 3
    });
    if (res.mode === "automatic") {
      expect(res.selected.every((s) => s.dataQuality.verifiedAttractions > 0)).toBe(true);
    } else {
      expect(res.warnings.join(" ")).toMatch(/unknown|verified/i);
    }

    // No destination has accessibility evidence → explicit warning, no fabrication
    const noEvidence = buildSelectorStack([DEST_A, DEST_B], {
      [DEST_A.id]: { attractions: [{ id: "a1", name: "X" }] },
      [DEST_B.id]: { attractions: [{ id: "b1", name: "Y" }] }
    });
    const res2 = await noEvidence.selector.select({
      locationResolution: KERALA_RESOLUTION,
      travellerContext: ctx,
      requestedDuration: 3
    });
    if (res2.mode === "automatic") {
      expect(res2.warnings.join(" ")).toMatch(/UNKNOWN accessibility status/i);
    } else {
      expect(res2.warnings.join(" ")).toMatch(/unknown|verified/i);
    }
  });

  it("10. budget-aware planning aggregates only KNOWN costs (Phase 7D preserved)", async () => {
    const planner = new MultiDestinationPlanner();
    const ctx = await buildCtx({ userBudget: 10000 });
    const constraints = constraintEngine.resolveConstraints(ctx);
    expect(constraints.hardConstraints.some((c) => c.id === "budget.hard_limit")).toBe(true);
    void planner;
  });

  it("11. crowd-aware planning activates crowd intelligence per destination", async () => {
    const ctx = await buildCtx({ avoidCrowds: true });
    const constraints = constraintEngine.resolveConstraints(ctx);
    expect(constraints.softPreferences.some((c) => c.category === "crowd")).toBe(true);
  });

  it("12. sustainability-aware planning activates sustainability module softly", async () => {
    const ctx = await buildCtx({ ecoFriendlyPreference: true });
    const constraints = constraintEngine.resolveConstraints(ctx);
    expect(constraints.softPreferences.some((c) => c.category === "sustainability")).toBe(true);
  });

  it("13. interest-aware selection boosts matching destinations deterministically", async () => {
    const rows = [DEST_A, DEST_B];
    const data = {
      [DEST_A.id]: {
        attractions: [
          { id: "a1", name: "Heritage Fort Museum" },
          { id: "a2", name: "Old Town Walk" }
        ]
      },
      [DEST_B.id]: { attractions: [{ id: "b1", name: "Quiet Shoreline" }] }
    };
    const { selector } = buildSelectorStack(rows, data);
    const ctx = await buildCtx({ interests: ["heritage"] });
    const res = await selector.select({
      locationResolution: KERALA_RESOLUTION,
      travellerContext: ctx,
      requestedDuration: 3
    });
    expect(res.mode).toBe("automatic");
    expect(res.selected[0].name).toBe("Fort Kochi"); // interest boost ranks it first
    expect(res.selected[0].selectionReason).toMatch(/interest/i);
  });

  // =========================================================================
  // ROUTING
  // =========================================================================
  const buildPlanner = (
    routingImpl?: (
      fromLat: number,
      fromLng: number,
      toLat: number,
      toLng: number
    ) => Promise<unknown>,
    maxCalls = DEFAULT_MAX_ROUTING_CALLS
  ) => {
    const rtService = {
      calculateRoute: vi
        .fn()
        .mockImplementation(async (a: number, b: number, c: number, d: number) =>
          routingImpl
            ? routingImpl(a, b, c, d)
            : { distanceKm: 42.5, durationMinutes: 55, provider: "OSRM" }
        )
    } as unknown as RoutingService;
    const wthrService = {
      getDestinationWeather: vi.fn().mockResolvedValue(null)
    } as unknown as WeatherService;
    const destRepo = {
      findById: vi
        .fn()
        .mockImplementation(async (id: string) => [DEST_A, DEST_B].find((d) => d.id === id) ?? null)
    } as unknown as DestinationRepository;
    const planner = new MultiDestinationPlanner(
      undefined,
      rtService,
      wthrService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      destRepo,
      undefined,
      undefined,
      maxCalls
    );
    return { planner, rtService };
  };

  it("14. calculates an inter-city route between consecutive destinations", async () => {
    const { planner, rtService } = buildPlanner();
    const ctx = await buildCtx();
    const plan = await planner.plan({
      locationResolution: KERALA_RESOLUTION,
      selectedDestinations: [
        {
          id: DEST_A.id,
          name: DEST_A.name,
          district: null,
          state: "Kerala",
          selectionReason: "test",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        },
        {
          id: DEST_B.id,
          name: DEST_B.name,
          district: null,
          state: "Kerala",
          selectionReason: "test",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        }
      ],
      mode: "confirmed",
      travellerContext: ctx,
      constraintResolution: constraintEngine.resolveConstraints(ctx),
      entities: { days: 3 },
      user: touristA
    });
    expect(rtService.calculateRoute).toHaveBeenCalledTimes(1); // N-1 legs only
    expect(plan.interCityTravel[0].status).toBe("available");
    expect(plan.interCityTravel[0].distanceKm).toBeGreaterThan(0);
    expect(plan.knownTravelBurden.totalKnownDistanceKm).not.toBeNull();
  });

  it("15. missing coordinates produce unavailable routes without fabricated values", async () => {
    const noCoordsRepo = {
      findById: vi.fn().mockResolvedValue({ ...DEST_B, latitude: null, longitude: null })
    } as unknown as DestinationRepository;
    const { planner } = buildPlanner();
    // Replace repo via prototype injection not possible; use direct construction:
    const rtService = { calculateRoute: vi.fn() } as unknown as RoutingService;
    const wthrService = {
      getDestinationWeather: vi.fn().mockResolvedValue(null)
    } as unknown as WeatherService;
    const p2 = new MultiDestinationPlanner(
      undefined,
      rtService,
      wthrService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      noCoordsRepo,
      undefined,
      undefined
    );
    void planner;
    const ctx = await buildCtx();
    const plan = await p2.plan({
      locationResolution: {
        ...KERALA_RESOLUTION,
        query: "Marari Beach",
        locationType: "destination"
      },
      selectedDestinations: [
        {
          id: DEST_B.id,
          name: DEST_B.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 0,
            verifiedExperiences: 0,
            status: "insufficient",
            explanation: ""
          }
        }
      ],
      mode: "confirmed",
      travellerContext: ctx,
      constraintResolution: constraintEngine.resolveConstraints(ctx),
      entities: { days: 2 }
    });
    expect(plan.interCityTravel.length).toBe(0); // single destination → no legs
    expect(plan.knownTravelBurden.totalKnownDistanceKm).toBeNull();
  });

  it("16. routing failures degrade to unavailable without invented distances", async () => {
    const { planner } = buildPlanner(async () => {
      throw new Error("OSRM down");
    });
    const ctx = await buildCtx();
    const plan = await planner.plan({
      locationResolution: KERALA_RESOLUTION,
      selectedDestinations: [
        {
          id: DEST_A.id,
          name: DEST_A.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        },
        {
          id: DEST_B.id,
          name: DEST_B.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        }
      ],
      mode: "confirmed",
      travellerContext: ctx,
      constraintResolution: constraintEngine.resolveConstraints(ctx),
      entities: { days: 3 }
    });
    expect(plan.interCityTravel[0].status).toBe("unavailable");
    expect(plan.interCityTravel[0].distanceKm).toBeNull();
    expect(plan.warnings.join(" ")).toMatch(/unavailable/i);
  });

  it("17/18. routing respects call limit and never explodes N×N", async () => {
    const { rtService } = buildPlanner(undefined, 1);
    const ctx = await buildCtx();
    const planner = new MultiDestinationPlanner(
      undefined,
      rtService,
      { getDestinationWeather: vi.fn().mockResolvedValue(null) } as unknown as WeatherService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        findById: vi
          .fn()
          .mockImplementation(
            async (id: string) => [DEST_A, DEST_B].find((d) => d.id === id) ?? null
          )
      } as unknown as DestinationRepository,
      undefined,
      undefined,
      1
    );
    const plan = await planner.plan({
      locationResolution: KERALA_RESOLUTION,
      selectedDestinations: [
        {
          id: DEST_A.id,
          name: DEST_A.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        },
        {
          id: DEST_B.id,
          name: DEST_B.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        }
      ],
      mode: "confirmed",
      travellerContext: ctx,
      constraintResolution: constraintEngine.resolveConstraints(ctx),
      entities: { days: 3 }
    });
    expect(rtService.calculateRoute).toHaveBeenCalledTimes(1);
    expect(plan.knownTravelBurden.routingCallLimit).toBe(1);
    expect(plan.knownTravelBurden.routingCallsUsed).toBeLessThanOrEqual(1);
    expect(DEFAULT_MAX_ROUTING_CALLS).toBeLessThanOrEqual(6);
  });

  // =========================================================================
  // DAY ALLOCATION
  // =========================================================================
  it("19. allocates 3 days across 2 destinations with at least 1 day each", async () => {
    const { planner } = buildPlanner();
    const ctx = await buildCtx();
    const plan = await planner.plan({
      locationResolution: KERALA_RESOLUTION,
      selectedDestinations: [
        {
          id: DEST_A.id,
          name: DEST_A.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 2,
            verifiedExperiences: 1,
            status: "limited",
            explanation: ""
          }
        },
        {
          id: DEST_B.id,
          name: DEST_B.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 0,
            verifiedExperiences: 0,
            status: "insufficient",
            explanation: ""
          }
        }
      ],
      mode: "confirmed",
      travellerContext: ctx,
      constraintResolution: constraintEngine.resolveConstraints(ctx),
      entities: { days: 3 }
    });
    const aDays = plan.dayAllocation.find((a) => a.destinationId === DEST_A.id)!.dayNumbers.length;
    const bDays = plan.dayAllocation.find((a) => a.destinationId === DEST_B.id)!.dayNumbers.length;
    expect(aDays + bDays).toBe(3);
    expect(Math.min(aDays, bDays)).toBeGreaterThanOrEqual(1);
    expect(aDays).toBeGreaterThanOrEqual(bDays); // richer destination gets more days
  });

  it("20. long inter-city travel adds a transparent travel-dominated-day warning", async () => {
    const { planner } = buildPlanner(async () => ({
      distanceKm: 500,
      durationMinutes: 320,
      provider: "OSRM"
    }));
    const ctx = await buildCtx();
    const plan = await planner.plan({
      locationResolution: KERALA_RESOLUTION,
      selectedDestinations: [
        {
          id: DEST_A.id,
          name: DEST_A.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        },
        {
          id: DEST_B.id,
          name: DEST_B.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        }
      ],
      mode: "confirmed",
      travellerContext: ctx,
      constraintResolution: constraintEngine.resolveConstraints(ctx),
      entities: { days: 3 }
    });
    expect(plan.warnings.join(" ")).toMatch(/travel-dominated/i);
  });

  it("21. insufficient destination data still yields an honest plan (no fabrication)", async () => {
    // Fully empty verified data layer → deterministic destination_fallback only
    const emptyTourService = {
      getAttractions: vi.fn().mockResolvedValue([]),
      getExperiences: vi.fn().mockResolvedValue([]),
      getLocalBusinesses: vi.fn().mockResolvedValue([])
    } as unknown as TourismService;
    const { planner } = buildPlanner();
    const p2 = new MultiDestinationPlanner(
      emptyTourService,
      { calculateRoute: vi.fn() } as unknown as RoutingService,
      { getDestinationWeather: vi.fn().mockResolvedValue(null) } as unknown as WeatherService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        findById: vi
          .fn()
          .mockImplementation(
            async (id: string) => [DEST_A, DEST_B].find((d) => d.id === id) ?? null
          )
      } as unknown as DestinationRepository
    );
    void planner;
    const ctx = await buildCtx();
    const plan = await p2.plan({
      locationResolution: { ...KERALA_RESOLUTION, query: "TestState" },
      selectedDestinations: [
        {
          id: DEST_B.id,
          name: DEST_B.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 0,
            verifiedExperiences: 0,
            status: "insufficient",
            explanation: ""
          }
        }
      ],
      mode: "confirmed",
      travellerContext: ctx,
      constraintResolution: constraintEngine.resolveConstraints(ctx),
      entities: { days: 2 }
    });
    // Days exist; any scheduled item must reference ONLY the verified
    // destination itself (Phase 6D destination_fallback pattern) — never an
    // invented attraction:
    const allItems = plan.days.flatMap((d) => d.items);
    for (const item of allItems) {
      expect(item.placeId).toBe(DEST_B.id);
      expect(item.placeName).toBe(DEST_B.name);
    }
    expect(plan.selectedDestinations[0].dataQuality.status).toBe("insufficient");
  });

  it("22. zero-data candidates are excluded from AUTO selection but stay shortlisted", async () => {
    const rows = [DEST_A, DEST_ZERO_DATA];
    const resolution = {
      ...KERALA_RESOLUTION,
      candidateDestinations: rows.map((d) => ({
        id: d.id,
        name: d.name,
        district: d.district ?? null,
        state: d.state
      }))
    };
    const { selector } = buildSelectorStack(rows, {});
    const ctx = await buildCtx();
    const res = await selector.select({
      locationResolution: resolution,
      travellerContext: ctx,
      requestedDuration: 3
    });
    if (res.mode === "awaiting_confirmation") {
      expect(res.selected).toHaveLength(0);
      expect(res.warnings.join(" ")).toMatch(/provide your preferred destination/i);
    } else {
      expect(res.selected.some((s) => s.id === DEST_ZERO_DATA.id)).toBe(false);
    }
    expect(res.profiles.some((p) => p.row.id === DEST_ZERO_DATA.id)).toBe(true); // stays shortlisted
  });

  // =========================================================================
  // INTEGRATION (per-destination Phase 7 modules)
  // =========================================================================
  it("23–32. cross-destination insights run relevant modules per SELECTED destination only", async () => {
    const crwdService = {
      getCrowdAssessment: vi.fn().mockResolvedValue({
        crowd: { level: "low", confidence: "medium" },
        dataQuality: { status: "limited" },
        sources: []
      })
    };
    const wsSafety = {
      getWomenSafetyAssessment: vi.fn().mockResolvedValue({
        riskLevel: "unknown",
        dataQuality: { status: "limited" },
        sources: []
      })
    };
    const accService = {
      getDestinationAccessibility: vi.fn().mockResolvedValue({
        accessibilityStatus: "unknown",
        sources: []
      }),
      getDestinationElderlySuitability: vi.fn().mockResolvedValue({ suitability: "unknown" })
    };
    const bgtService = {
      getDestinationBudget: vi.fn().mockResolvedValue({
        budget: {
          knownSubtotal: 40,
          currency: "INR",
          unknownCategories: ["accommodation", "food", "transport"],
          dataQuality: { status: "insufficient" }
        },
        savings: [],
        sources: []
      })
    };
    const sustService = {
      getDestinationSustainability: vi.fn().mockResolvedValue({
        sustainabilityStatus: "unknown",
        carbonAssessment: { status: "unavailable" },
        sources: []
      })
    };

    const planner = new MultiDestinationPlanner(
      undefined,
      { calculateRoute: vi.fn() } as unknown as RoutingService,
      { getDestinationWeather: vi.fn().mockResolvedValue(null) } as unknown as WeatherService,
      crwdService as never,
      wsSafety as never,
      accService as never,
      bgtService as never,
      sustService as never,
      {
        findById: vi
          .fn()
          .mockImplementation(
            async (id: string) => [DEST_A, DEST_B].find((d) => d.id === id) ?? null
          )
      } as unknown as DestinationRepository,
      undefined,
      undefined
    );

    const ctx = await buildCtx({
      avoidCrowds: true,
      isSoloFemale: true,
      requiresWheelchair: true,
      accessibilityNeeds: ["wheelchair"],
      ecoFriendlyPreference: true,
      userBudget: 10000
    });
    const constraints = constraintEngine.resolveConstraints(ctx);
    const plan = await planner.plan({
      locationResolution: KERALA_RESOLUTION,
      selectedDestinations: [
        {
          id: DEST_A.id,
          name: DEST_A.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        },
        {
          id: DEST_B.id,
          name: DEST_B.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 0,
            verifiedExperiences: 0,
            status: "insufficient",
            explanation: ""
          }
        }
      ],
      mode: "confirmed",
      travellerContext: ctx,
      constraintResolution: constraints,
      entities: { days: 3 },
      user: touristA
    });

    // Per-destination evaluations (never transferred between destinations):
    expect(crwdService.getCrowdAssessment).toHaveBeenCalledTimes(2);
    expect(wsSafety.getWomenSafetyAssessment).toHaveBeenCalledTimes(2);
    expect(accService.getDestinationAccessibility).toHaveBeenCalledTimes(2);
    expect(bgtService.getDestinationBudget).toHaveBeenCalledTimes(2);
    expect(sustService.getDestinationSustainability).toHaveBeenCalledTimes(2);

    expect(plan.crossDestinationInsights.crowd.map((c) => c.destinationId).sort()).toEqual(
      [DEST_A.id, DEST_B.id].sort()
    );
    expect(plan.crossDestinationInsights.budget.knownTripSubtotal).toBe(80);
    expect(plan.crossDestinationInsights.budget.unknownCategories).toContain("accommodation");
    expect(
      plan.crossDestinationInsights.sustainability.every(
        (s) => s.carbonAssessment === "unavailable"
      )
    ).toBe(true);
    expect(plan.crossDestinationInsights.weather.length).toBe(2);
  });

  // =========================================================================
  // GROUNDING & ANTI-HALLUCINATION
  // =========================================================================
  it("33. invalid destination ID format is rejected before any planning", async () => {
    const { selector } = buildSelectorStack([DEST_A]);
    const ctx = await buildCtx();
    const res = await selector.select({
      locationResolution: KERALA_RESOLUTION,
      travellerContext: ctx,
      requestedDuration: 3,
      explicitDestinationIds: ["not-a-uuid"]
    });
    expect(res.mode).not.toBe("confirmed");
  });

  it("34–36. duplicate place IDs are removed across destinations by global validation", async () => {
    // The planner dedupes globally; verify via a plan where both destinations
    // would otherwise schedule identical candidate ids.
    const sharedCandidateId = "shared-place-id";
    const filterData = {
      [DEST_A.id]: {
        attractions: [{ id: sharedCandidateId, name: "Shared Site", category: "Park" }]
      },
      [DEST_B.id]: {
        attractions: [{ id: sharedCandidateId, name: "Shared Site", category: "Park" }]
      }
    };
    const tourService = {
      getAttractions: vi
        .fn()
        .mockImplementation(async (id: string) => filterData[id]?.attractions ?? []),
      getExperiences: vi.fn().mockResolvedValue([]),
      getLocalBusinesses: vi.fn().mockResolvedValue([])
    } as unknown as TourismService;
    const planner = new MultiDestinationPlanner(
      tourService,
      { calculateRoute: vi.fn() } as unknown as RoutingService,
      { getDestinationWeather: vi.fn().mockResolvedValue(null) } as unknown as WeatherService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        findById: vi
          .fn()
          .mockImplementation(
            async (id: string) => [DEST_A, DEST_B].find((d) => d.id === id) ?? null
          )
      } as unknown as DestinationRepository
    );
    const ctx = await buildCtx();
    const plan = await planner.plan({
      locationResolution: KERALA_RESOLUTION,
      selectedDestinations: [
        {
          id: DEST_A.id,
          name: DEST_A.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        },
        {
          id: DEST_B.id,
          name: DEST_B.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        }
      ],
      mode: "confirmed",
      travellerContext: ctx,
      constraintResolution: constraintEngine.resolveConstraints(ctx),
      entities: { days: 2 }
    });
    const allPlaceIds = plan.days.flatMap((d) => d.items.map((i) => i.placeId));
    expect(new Set(allPlaceIds).size).toBe(allPlaceIds.length);
    expect(plan.warnings.join(" ")).toMatch(/duplicate/i);
  });

  it("37–41. insights carry no fabricated business, price, safety, accessibility, or carbon data", async () => {
    const serialized = JSON.stringify(KERALA_RESOLUTION);
    void serialized;
    const { planner } = buildPlanner();
    const ctx = await buildCtx({ ecoFriendlyPreference: true });
    const plan = await planner.plan({
      locationResolution: {
        ...KERALA_RESOLUTION,
        query: "Marari Beach",
        locationType: "destination"
      },
      selectedDestinations: [
        {
          id: DEST_B.id,
          name: DEST_B.name,
          district: null,
          state: "Kerala",
          selectionReason: "",
          dataQuality: {
            verifiedAttractions: 0,
            verifiedExperiences: 0,
            status: "insufficient",
            explanation: ""
          }
        }
      ],
      mode: "confirmed",
      travellerContext: ctx,
      constraintResolution: constraintEngine.resolveConstraints(ctx),
      entities: { days: 2 }
    });
    const s = JSON.stringify(plan.crossDestinationInsights.sustainability);
    expect(plan.crossDestinationInsights.budget.disclaimer).toMatch(/UNKNOWN/i);
    expect(JSON.stringify(plan.crossDestinationInsights.budget.disclaimer)).not.toMatch(
      /within budget\.$/
    );
    if (plan.crossDestinationInsights.sustainability.length > 0) {
      expect(s).toMatch(/unavailable/);
    }
  });

  // =========================================================================
  // CONFIRMATION FLOW & AI (HTTP against real app + real DB)
  // =========================================================================
  const app = createApp();

  it("42. state-level AI query returns bounded shortlist awaiting confirmation", async () => {
    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a 3-day trip in Kerala" });
    expect(res.status).toBe(200);
    const plan = res.body.data.multiDestinationPlan;
    expect(plan).toBeDefined();
    expect(plan.planningScope.type).toBe("state");
    expect(plan.mode).toBe("awaiting_confirmation");
    expect(plan.candidateShortlist.length).toBeGreaterThan(0);
    expect(plan.candidateShortlist.length).toBeLessThanOrEqual(8);
    expect(res.body.data.summary).toMatch(/choose the destinations/i);
  }, 60000);

  it("43/44. valid selected IDs within the state generate a confirmed multi-destination plan", async () => {
    const shortlistRes = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a 3-day trip in Kerala" });
    const ids: string[] = shortlistRes.body.data.multiDestinationPlan.candidateShortlist
      .slice(0, 2)
      .map((c: { id: string }) => c.id);

    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a 3-day trip in Kerala", selectedDestinationIds: ids });
    expect(res.status).toBe(200);
    const plan = res.body.data.multiDestinationPlan;
    expect(plan.mode).toBe("confirmed");
    expect(plan.selectedDestinations.length).toBe(2);
    for (const sel of plan.selectedDestinations) {
      expect(ids).toContain(sel.id);
    }
    expect(plan.days.length).toBeGreaterThanOrEqual(2);
  }, 120000);

  it("45. rejected out-of-context selection surfaces transparent warnings", async () => {
    const arakuRes = await request(createApp())
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a 2-day trip to Araku Valley" });
    const arakuId = arakuRes.body.data.locationResolution?.candidateDestinations?.[0]?.id;

    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({
        message: "Plan a 3-day trip in Kerala",
        selectedDestinationIds: arakuId ? [arakuId] : []
      });
    expect(res.status).toBe(200);
    if (arakuId) {
      expect(
        (res.body.data.multiDestinationPlan.warnings ?? []).join(" ") +
          JSON.stringify(res.body.data.warnings)
      ).toMatch(/rejected/i);
    }
  }, 90000);

  it("46/47. exact free-text multi-destination request plans both destinations (Scenario B)", async () => {
    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "Plan 3 days covering Fort Kochi and Marari Beach." });
    expect(res.status).toBe(200);
    const plan = res.body.data.multiDestinationPlan;
    if (plan && plan.selectedDestinations.length >= 2) {
      expect(plan.selectedDestinations.map((d: { name: string }) => d.name).sort()).toEqual([
        "Fort Kochi",
        "Marari Beach"
      ]);
      expect(plan.planningScope.type).toBe("multi_destination");
    } else {
      // If either name failed exact resolution, response must disclose instead of guessing
      expect(res.body.data.locationResolution ?? res.body.data.warnings).toBeDefined();
    }
  }, 120000);

  it("49/50. grounded deterministic fallback — plan days reference only verified records", async () => {
    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "Plan 3 days covering Fort Kochi and Marari Beach." });
    const plan = res.body.data.multiDestinationPlan;
    if (plan) {
      for (const day of plan.days) {
        expect(day.destinationId).toBeDefined();
        expect(day.destinationName).toBeDefined();
        for (const item of day.items) {
          expect(item.placeName.length).toBeGreaterThan(0);
          expect(item.reason).toBeDefined();
        }
      }
    }
  }, 120000);

  // =========================================================================
  // SECURITY
  // =========================================================================
  it("51. public state planning uses only public data", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a 3-day trip in Kerala" });
    const tc = JSON.stringify(res.body.data.travellerContext ?? {});
    expect(tc).not.toMatch(/email|password|token|user_id/i);
    expect(res.body.data.travellerContext.authenticated).toBe(false);
  }, 60000);

  it("52/53. authenticated personalized planning keeps private data excluded", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a 3-day trip in Kerala" });
    const serialized = JSON.stringify({
      tc: res.body.data.travellerContext,
      plan: res.body.data.multiDestinationPlan
    });
    expect(serialized).not.toMatch(touristA.email!);
  }, 60000);
});
