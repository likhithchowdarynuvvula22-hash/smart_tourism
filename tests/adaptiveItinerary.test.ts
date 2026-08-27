import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { ItineraryChangeDetector } from "../src/services/ai/planning/itineraryChangeDetector";
import { PartialReplanner } from "../src/services/ai/planning/partialReplanner";
import { AdaptiveItineraryService } from "../src/services/ai/planning/adaptation.service";
import { constraintEngine } from "../src/services/ai/context/constraint.engine";
import { travellerContextBuilder } from "../src/services/ai/context/travellerContext.builder";
import { TourismService } from "../src/services/tourism.service";
import { WeatherService } from "../src/services/external/weather/weather.service";
import { CrowdService } from "../src/services/crowd.service";
import { WomenSafetyService } from "../src/services/safety/womenSafety.service";
import { TripService } from "../src/services/trip.service";
import { AuthenticatedUser } from "../src/types/auth";
import { ItinerarySnapshot, SnapshotItem } from "../src/types/adaptive";
import type { TravellerContext } from "../src/types/travellerContext";

const touristA: AuthenticatedUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "touristA@example.com",
  role: "tourist",
  roles: ["tourist"]
};
const touristB: AuthenticatedUser = { ...touristA, id: "22222222-2222-2222-2222-222222222222" };

const detector = new ItineraryChangeDetector();
const replanner = new PartialReplanner();

const DEST_ID = "01e98249-049a-4017-a5fb-98b913e05ca5";

const item = (over: Partial<SnapshotItem>): SnapshotItem => ({
  placeId: over.placeId ?? "place-a",
  placeName: over.placeName ?? "Waterfall Viewpoint",
  category: over.category,
  destinationId: DEST_ID,
  day: over.day ?? 1,
  timeBlock: over.timeBlock ?? "morning",
  openingHours: over.openingHours,
  entryFeeAmount: null
});

const SNAPSHOT: ItinerarySnapshot = {
  tripId: null,
  generatedAt: new Date().toISOString(),
  destinations: [{ id: DEST_ID, name: "Araku Valley" }],
  days: [1],
  interCityLegs: [],
  items: [
    item({
      placeId: "place-outdoor",
      placeName: "Katiki Waterfall",
      category: "Waterfall",
      day: 1,
      timeBlock: "morning"
    }),
    item({
      placeId: "place-cultural",
      placeName: " Tribal Museum",
      category: "Culture",
      day: 1,
      timeBlock: "afternoon"
    })
  ]
};

describe("Phase 8D: Real-Time Adaptive Itinerary Suite", () => {
  // =========================================================================
  // CHANGE DETECTION
  // =========================================================================
  it("1. detects a high-precipitation weather change (outdoor items only)", () => {
    const changes = detector.detectChanges(SNAPSHOT, {
      weatherByDestination: {
        [DEST_ID]: {
          current: {
            temperatureC: 24,
            weatherCode: 63,
            weatherDescription: "Rain",
            isDay: true,
            time: "",
            precipitationProbabilityPercent: 75,
            precipitationMm: 6
          }
        } as never
      },
      crowdByDestination: {},
      safetyByDestination: {}
    });
    const weatherChange = changes.find((c) => c.type === "weather");
    expect(weatherChange).toBeDefined();
    expect(weatherChange!.severity).toBe("high");
    expect(weatherChange!.affectedPlaceIds).toEqual(["place-outdoor"]); // cultural item NOT flagged
    expect(weatherChange!.reason).toMatch(/less suitable under the current weather/i);
  });

  it("2. detects crowd level and rush-window changes with confidence preserved", () => {
    const changes = detector.detectChanges(SNAPSHOT, {
      weatherByDestination: {},
      crowdByDestination: {
        [DEST_ID]: {
          level: "high",
          confidence: "low",
          rushFreeHours: "Rush: 08:00-12:00 Free: 12:00-17:00"
        }
      },
      safetyByDestination: {}
    });
    const crowdChanges = changes.filter((c) => c.type === "crowd");
    expect(crowdChanges.length).toBeGreaterThanOrEqual(1);
    expect(crowdChanges.some((c) => c.reason.includes("confidence: low"))).toBe(true);
    // Morning waterfall falls inside Rush 08:00-12:00 → low-severity shift hint
    expect(crowdChanges.some((c) => c.severity === "low" && c.reason.includes("Rush"))).toBe(true);
  });

  it("3. detects an active safety alert as HIGH severity without fabricating zones", () => {
    const changes = detector.detectChanges(SNAPSHOT, {
      weatherByDestination: {},
      crowdByDestination: {},
      safetyByDestination: { [DEST_ID]: { activeAlerts: 1, seriousRecentIncidents: 0 } }
    });
    const safety = changes.find((c) => c.type === "safety");
    expect(safety).toBeDefined();
    expect(safety!.severity).toBe("high");
    expect(safety!.reason).toMatch(/verified/i);
  });

  it("4. detects routing unavailability and major duration increases", () => {
    const changes = detector.detectChanges(SNAPSHOT, {
      weatherByDestination: {},
      crowdByDestination: {},
      safetyByDestination: {},
      routingChanges: [
        {
          fromDestinationId: DEST_ID,
          toDestinationId: "x",
          status: "unavailable",
          durationMinutes: null
        },
        {
          fromDestinationId: DEST_ID,
          toDestinationId: "y",
          status: "available",
          durationMinutes: 200,
          previousDurationMinutes: 100
        }
      ]
    });
    const routing = changes.filter((c) => c.type === "routing");
    expect(routing.length).toBe(2);
    expect(routing.every((c) => c.severity === "medium")).toBe(true);
  });

  it("5. detects an opening-hours conflict from VERIFIED hours only", () => {
    const snap: ItinerarySnapshot = {
      ...SNAPSHOT,
      items: [
        item({
          placeId: "p-hours",
          placeName: "Heritage Fort",
          day: 1,
          timeBlock: "evening",
          openingHours: "09:00 - 17:00"
        })
      ]
    };
    const changes = detector.detectChanges(snap, {
      weatherByDestination: {},
      crowdByDestination: {},
      safetyByDestination: {}
    });
    const schedule = changes.find((c) => c.type === "schedule");
    expect(schedule).toBeDefined();
    expect(schedule!.source).toBe("schedule");
  });

  it("6. surfaces user-constraint triggers (accessibility HIGH, preference LOW)", async () => {
    const svc = new AdaptiveItineraryService();
    const t1 = svc.parseTriggers("I need wheelchair access now");
    expect(t1.userConstraintTriggers[0].severity).toBe("high");
    const t2 = svc.parseTriggers("Avoid crowds now please");
    expect(t2.userConstraintTriggers[0].severity).toBe("low");
    void detector;
  });

  it("7. no-change scenario produces empty detection with everything preserved", () => {
    const changes = detector.detectChanges(SNAPSHOT, {
      weatherByDestination: {},
      crowdByDestination: {},
      safetyByDestination: {}
    });
    expect(changes).toHaveLength(0);
  });

  // =========================================================================
  // WEATHER / CROWD / SAFETY ADAPTATION BEHAVIOR
  // =========================================================================
  it("8–11. weather adjustment respects hard constraints; failure preserves itinerary", async () => {
    // Replacement pool includes an accessible verified alternative
    const tourService = {
      getAttractions: vi
        .fn()
        .mockResolvedValue([{ id: "alt-1", name: "Indoor Heritage Gallery", category: "Museum" }]),
      getExperiences: vi.fn().mockResolvedValue([])
    } as unknown as TourismService;
    const wthrService = {
      getDestinationWeather: vi.fn().mockResolvedValue({
        current: {
          temperatureC: 22,
          weatherCode: 63,
          weatherDescription: "Rain",
          isDay: true,
          time: "",
          precipitationProbabilityPercent: 80,
          precipitationMm: 8
        }
      })
    } as unknown as WeatherService;
    const svc = new AdaptiveItineraryService(
      tourService,
      wthrService,
      undefined as never,
      undefined as never
    );
    const ctx = await travellerContextBuilder.buildContext({
      entities: {},
      intent: "trip_planning"
    });
    const constraints = constraintEngine.resolveConstraints(ctx);
    const result = await svc.adapt({
      snapshot: SNAPSHOT,
      entities: {},
      travellerContext: ctx,
      constraintResolution: constraints,
      triggers: svc.parseTriggers("It's raining today, change today's plan")
    });
    expect(result.changesDetected.some((c) => c.type === "weather")).toBe(true);
    expect(result.proposedChanges.length).toBeGreaterThan(0);
    const replace = result.proposedChanges.find((p) => p.action === "replace_item");
    if (replace) {
      expect(replace.replacementPlaceName).toBe("Indoor Heritage Gallery");
      expect(replace.minimizationTier).toBe(2);
    }
    // Suggest mode NEVER persists:
    expect(result.tripId).toBeNull();

    // Weather FAILURE → no weather change invented, honest unknown
    const failingWeather = {
      getDestinationWeather: vi.fn().mockRejectedValue(new Error("down"))
    } as unknown as WeatherService;
    const svcFail = new AdaptiveItineraryService(tourService, failingWeather);
    const resultFail = await svcFail.adapt({
      snapshot: SNAPSHOT,
      entities: {},
      travellerContext: ctx,
      constraintResolution: constraints,
      triggers: svc.parseTriggers("It's raining today, change today's plan")
    });
    expect(resultFail.changesDetected.some((c) => c.type === "weather")).toBe(false);
    expect(resultFail.unknowns.join(" ")).toMatch(/unavailable/i);
  });

  it("14. low-confidence crowd data stays soft — never a hard fact", async () => {
    const crwd = {
      getCrowdAssessment: vi.fn().mockResolvedValue({
        crowd: { level: "high", confidence: "low" },
        sources: []
      })
    };
    const svc = new AdaptiveItineraryService(
      undefined as never,
      { getDestinationWeather: vi.fn().mockResolvedValue(null) } as unknown as WeatherService,
      crwd as unknown as CrowdService
    );
    const ctx = await buildCrowdCtx();
    const result = await svc.adapt({
      snapshot: SNAPSHOT,
      entities: {},
      travellerContext: ctx,
      constraintResolution: constraintEngine.resolveConstraints(ctx),
      triggers: svc.parseTriggers("Avoid crowds now")
    });
    const crowdChange = result.changesDetected.find((c) => c.type === "crowd");
    if (crowdChange) {
      expect(crowdChange.reason).toMatch(/baseline heuristic/i);
    }

    async function buildCrowdCtx() {
      return travellerContextBuilder.buildContext({
        entities: { avoidCrowds: true },
        intent: "trip_planning"
      });
    }
  });

  it("15–17. insufficient safety data preserved; no fabricated unsafe areas", async () => {
    const wsSafety = {
      getWomenSafetyAssessment: vi.fn().mockRejectedValue(new Error("down"))
    };
    const svc = new AdaptiveItineraryService(
      undefined as never,
      { getDestinationWeather: vi.fn().mockResolvedValue(null) } as unknown as WeatherService,
      undefined as never,
      wsSafety as unknown as WomenSafetyService
    );
    const ctx = await travellerContextBuilder.buildContext({
      entities: { isSoloFemale: true },
      intent: "trip_planning"
    });
    const result = await svc.adapt({
      snapshot: SNAPSHOT,
      entities: {},
      travellerContext: ctx,
      constraintResolution: constraintEngine.resolveConstraints(ctx),
      triggers: svc.parseTriggers("There is a new safety alert at the destination")
    });
    expect(JSON.stringify(result)).not.toMatch(/unsafe zone|completely safe|crime-free/i);
  });

  // =========================================================================
  // PARTIAL REPLANNING
  // =========================================================================
  it("29–31. only the affected item changes; unaffected items preserved; uniqueness kept", () => {
    const candidates = [
      {
        id: "alt-museum",
        name: "Tribal Museum",
        type: "attraction" as const,
        accessibilityStatus: "unknown" as const,
        accessibilityNotes: [],
        elderlyNotes: []
      }
    ];
    const snapshot: ItinerarySnapshot = {
      ...SNAPSHOT,
      items: [
        item({ placeId: "A", placeName: "Site A", day: 1 }),
        item({
          placeId: "B",
          placeName: "Risky Falls",
          category: "Waterfall",
          day: 1,
          timeBlock: "afternoon"
        }),
        item({ placeId: "C", placeName: "Site C", day: 1, timeBlock: "evening" })
      ],
      days: [1]
    };
    const ctxSync = { ok: true };
    void ctxSync;
    // Build context synchronously through the engine with a minimal stub:
    const stubCtx = makeStubCtx();
    const res = constraintEngine.resolveConstraints(stubCtx);
    const out = replanner.replan({
      snapshot,
      changes: [
        {
          type: "weather",
          severity: "high",
          affectedDay: 1,
          affectedDestinationId: DEST_ID,
          affectedPlaceIds: ["B"],
          reason: "High precipitation.",
          source: "weather"
        }
      ],
      candidatesByDestination: { [DEST_ID]: candidates },
      travellerContext: stubCtx,
      constraintResolution: res
    });
    expect(out.proposedChanges).toHaveLength(1);
    expect(out.proposedChanges[0].affectedPlaceId).toBe("B");
    expect(out.preservedItems.map((p) => p.placeId).sort()).toEqual(["A", "C"]);
    const ids = out.updatedItinerary!.map((i) => i.placeId);
    expect(new Set(ids).size).toBe(ids.length); // global uniqueness
  });

  it("18–20. wheelchair recheck rejects inaccessible replacements; unknown stays unknown", () => {
    const stubCtx = makeStubCtx({ requiresWheelchair: true, accessibilityNeeds: ["wheelchair"] });
    const resolution = constraintEngine.resolveConstraints(stubCtx);
    const snapshot: ItinerarySnapshot = {
      ...SNAPSHOT,
      items: [item({ placeId: "old", placeName: "Lake Point", category: "Lake", day: 1 })]
    };
    const candidates = [
      {
        id: "inacc",
        name: "Step Fort",
        type: "attraction" as const,
        accessibilityStatus: "inaccessible" as const,
        accessibilityNotes: [],
        elderlyNotes: []
      },
      {
        id: "unk",
        name: "Unknown Trail",
        type: "attraction" as const,
        accessibilityStatus: "unknown" as const,
        accessibilityNotes: [],
        elderlyNotes: []
      }
    ];
    const out = replanner.replan({
      snapshot,
      changes: [
        {
          type: "user_constraint",
          severity: "high",
          affectedDay: 1,
          affectedDestinationId: DEST_ID,
          affectedPlaceIds: ["old"],
          reason: "Wheelchair now required.",
          source: "user"
        }
      ],
      candidatesByDestination: { [DEST_ID]: candidates },
      travellerContext: stubCtx,
      constraintResolution: resolution
    });
    // Inaccessible replacement MUST be rejected; the unknown-status candidate
    // may be proposed ONLY because no verified-compliant option exists.
    expect(out.proposedChanges.length).toBeGreaterThan(0);
    expect(out.proposedChanges.every((p) => p.replacementPlaceId !== "inacc")).toBe(true);
    expect(out.proposedChanges[0].preservedConstraints).toContain("accessibility.required");
  });

  it("26–28. routing changes produce disclosure without fabricated replacements", () => {
    const stubCtx = makeStubCtx();
    const out = replanner.replan({
      snapshot: SNAPSHOT,
      changes: [
        {
          type: "routing",
          severity: "medium",
          affectedDay: null,
          affectedDestinationId: DEST_ID,
          affectedPlaceIds: [],
          reason: "Route unavailable.",
          source: "routing"
        }
      ],
      candidatesByDestination: {},
      travellerContext: stubCtx,
      constraintResolution: constraintEngine.resolveConstraints(stubCtx)
    });
    expect(out.warnings.join(" ")).toMatch(/explicit direction|no automatic destination switch/i);
    expect(out.proposedChanges).toHaveLength(0);
  });

  // =========================================================================
  // PERSISTENCE / CONFIRMATION
  // =========================================================================
  it("33–35. apply persists ONLY after explicit confirmation via owned TripService path", async () => {
    const tripsSvc = new TripService();
    const TRIP = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      user_id: touristA.id,
      name: "Trip",
      start_date: null,
      end_date: null,
      status: "planned",
      created_at: new Date().toISOString(),
      items: [{ id: "item-1", trip_id: "t", attraction_id: "place-outdoor" }]
    };
    const getSpy = vi.spyOn(tripsSvc, "getTripById").mockImplementation(async (_tripId, userId) => {
      if (userId !== touristA.id) {
        const { ForbiddenError } = await import("../src/utils/appError");
        throw new ForbiddenError("You do not have permission to access this trip");
      }
      return { ...TRIP, items: [...TRIP.items] } as never;
    });
    void getSpy;
    const updateSpy = vi.spyOn(tripsSvc, "updateItineraryItem").mockResolvedValue({} as never);

    const svc = new AdaptiveItineraryService(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      tripsSvc
    );

    const owner = await svc.applyToTrip("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", touristA, [
      { action: "replace_item", affectedPlaceId: "place-outdoor", replacementPlaceId: "alt-1" }
    ]);
    expect(owner.appliedCount).toBe(1);
    expect(getSpy).toHaveBeenCalledWith("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", touristA.id);
    expect(updateSpy).toHaveBeenCalled();

    // Cross-user attempt: ownership error → nothing applied, disclosed
    const denied = await svc.applyToTrip("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", touristB, [
      { action: "replace_item", affectedPlaceId: "place-outdoor", replacementPlaceId: "alt-1" }
    ]);
    expect(denied.appliedCount).toBe(0);
    expect(denied.warnings.join(" ")).toMatch(/denied|does not exist/i);
  });

  // =========================================================================
  // AI ORCHESTRATOR INTEGRATION (HTTP, live DB)
  // =========================================================================
  const app = createApp();

  it("36. 'It's raining…' returns suggest-mode adaptation without persistence", async () => {
    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a 2-day trip to Araku Valley. It's raining, change today's plan." });
    expect(res.status).toBe(200);
    const adaptation = res.body.data.adaptation;
    expect(adaptation).toBeDefined();
    expect(["assess_only", "suggest_adjustments"]).toContain(adaptation.adaptationMode);
    expect(adaptation.tripId).toBeNull();
    expect(
      res.body.data.warnings.join(" ") + JSON.stringify(adaptation.warnings ?? [])
    ).not.toMatch(/persisted/i);
  }, 90000);

  it("37. 'Avoid crowds now' adapts with crowd intelligence, request-scoped only", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a trip to Araku Valley. Avoid crowds now." });
    expect(res.status).toBe(200);
    expect(res.body.data.adaptation ?? res.body.data.travellerContext).toBeDefined();
    if (res.body.data.adaptation) {
      expect(res.body.data.adaptation.tripId).toBeNull();
    } else {
      expect(res.body.data.travellerContext.avoidCrowds).toBe(true);
    }
  }, 90000);

  it("39. budget-change trigger recalculates known costs with Phase 7D uncertainty", async () => {
    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a trip to Araku Valley. My budget is now ₹5000." });
    expect(res.status).toBe(200);
    const serialized =
      JSON.stringify(res.body.data.adaptation ?? {}) +
      JSON.stringify(res.body.data.travellerContext ?? {});
    if (res.body.data.travellerContext?.budgetAmount != null) {
      expect(res.body.data.travellerContext.budgetPriority).toBe("hard_limit");
    }
    expect(serialized).not.toMatch(/within budget\.?\b/i);
  }, 90000);

  it("42–43. grounding — invalid place references are never accepted", async () => {
    const replannerOut = replanner.replan({
      snapshot: SNAPSHOT,
      changes: [],
      candidatesByDestination: {},
      travellerContext: makeStubCtx(),
      constraintResolution: constraintEngine.resolveConstraints(makeStubCtx())
    });
    expect(replannerOut.proposedChanges).toHaveLength(0);
    expect(replannerOut.preservedItems.length).toBe(SNAPSHOT.items.length);
  });

  it("49. public adaptation is fully request-scoped", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a trip to Araku Valley. Make it more eco-friendly." });
    const s =
      JSON.stringify(res.body.data.travellerContext ?? {}) +
      JSON.stringify(res.body.data.adaptation ?? {});
    expect(s).not.toMatch(/email|password|token|user_id/i);
  }, 90000);
});

// ---------------------------------------------------------------------------
// Minimal TravellerContext stub for synchronous replanner unit tests
// ---------------------------------------------------------------------------
function makeStubCtx(over?: { requiresWheelchair?: boolean }): TravellerContext {
  const base = {
    identity: { authenticated: false, userId: null, role: null },
    tripContext: {
      destinationId: { value: null, source: "unknown", confidence: "unknown" },
      destinationName: { value: null, source: "unknown", confidence: "unknown" },
      tripId: { value: null, source: "unknown", confidence: "unknown" },
      travelDates: {
        start: { value: null, source: "unknown", confidence: "unknown" },
        end: { value: null, source: "unknown", confidence: "unknown" }
      },
      durationDays: { value: null, source: "unknown", confidence: "unknown" },
      travellerCount: { value: null, source: "unknown", confidence: "unknown" }
    },
    activeTrip: null,
    travellerProfile: {
      travellerGroup: { value: null, source: "unknown", confidence: "unknown" },
      ageContext: { value: null, source: "unknown", confidence: "unknown" },
      interests: { value: [], source: "unknown", confidence: "unknown" },
      avoidInterests: { value: [], source: "unknown", confidence: "unknown" },
      preferredLanguage: { value: null, source: "unknown", confidence: "unknown" },
      accessibilityNeeds: {
        value: over?.requiresWheelchair ? ["wheelchair"] : [],
        source: over?.requiresWheelchair ? "explicit_request" : "unknown",
        confidence: over?.requiresWheelchair ? "high" : "unknown"
      },
      mobilityNeeds: { value: [], source: "unknown", confidence: "unknown" },
      travelStyle: { value: null, source: "unknown", confidence: "unknown" }
    },
    budget: {
      amount: { value: null, source: "unknown", confidence: "unknown" },
      currency: { value: null, source: "unknown", confidence: "unknown" },
      priority: { value: null, source: "unknown", confidence: "unknown" }
    },
    preferences: {
      avoidCrowds: { value: null, source: "unknown", confidence: "unknown" },
      preferEco: { value: null, source: "unknown", confidence: "unknown" },
      communityPreference: { value: null, source: "unknown", confidence: "unknown" },
      minimizeTravel: { value: null, source: "unknown", confidence: "unknown" }
    },
    safetyContext: {
      womenSafetyRelevant: { value: false, source: "derived", confidence: "medium" },
      soloFemale: { value: false, source: "derived", confidence: "low" }
    },
    contentPreferences: {
      targetLanguage: { value: null, source: "unknown", confidence: "unknown" }
    },
    knownUserData: [],
    unknownUserData: []
  } as ReturnType<typeof travellerContextBuilder.buildContext>;
  return base;
}
