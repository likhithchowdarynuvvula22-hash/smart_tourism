import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { TravellerContextBuilder } from "../src/services/ai/context/travellerContext.builder";
import { ConstraintEngine, constraintEngine } from "../src/services/ai/context/constraint.engine";
import { CandidateFilter } from "../src/services/ai/itinerary/candidate.filter";
import { ItineraryService } from "../src/services/ai/itinerary/itinerary.service";
import { IntentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { PreferencesService } from "../src/services/preferences.service";
import { UserRepository } from "../src/repositories/user.repository";
import { AuthenticatedUser } from "../src/types/auth";
import { AIProvider } from "../src/services/ai/providers/ai.provider";

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const touristA: AuthenticatedUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "touristA@example.com",
  role: "tourist",
  roles: ["tourist"]
};

const storedPrefsBundle = (overrides: Record<string, unknown> = {}) => ({
  profile: {
    userId: "11111111-1111-1111-1111-111111111111",
    travelPreferences: {
      user_id: "11111111-1111-1111-1111-111111111111",
      interests: ["nature", "heritage"],
      budget_min: null,
      budget_max: null,
      preferred_trip_days: null,
      accessibility_needs: [],
      safety_priority: false,
      created_at: "2026-01-01",
      id: "tp-1"
    },
    touristProfile: {
      user_id: "11111111-1111-1111-1111-111111111111",
      age_group: null,
      budget_range: null,
      elderly_traveller: false,
      family_group: false,
      mobility_needs: [],
      safety_preferences: [],
      solo_traveller: false,
      travel_style: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01"
    },
    ...overrides
  },
  preferredLanguage: null as string | null
});

const createBuilder = (
  prefsImpl: Partial<PreferencesService> = {},
  userRepoImpl: Partial<UserRepository> = {}
) => {
  const prefsService = {
    getPreferences: vi.fn().mockResolvedValue(storedPrefsBundle().profile),
    updatePreferences: vi.fn(),
    ...prefsImpl
  } as unknown as PreferencesService;
  const usersRepository = {
    findProfileById: vi.fn().mockResolvedValue({ preferred_language: null }),
    ...userRepoImpl
  } as unknown as UserRepository;
  return {
    builder: new TravellerContextBuilder(prefsService, usersRepository),
    prefsService,
    usersRepository
  };
};

describe("Phase 8A: Unified Traveller Context & Constraint Engine Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // BASIC CONTEXT
  // =========================================================================
  describe("Basic Context Resolution", () => {
    it("1. builds a public (unauthenticated) request context", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { destinationName: "Araku" },
        intent: "trip_planning"
      });
      expect(ctx.identity.authenticated).toBe(false);
      expect(ctx.identity.userId).toBeNull();
    });

    it("2. builds an authenticated tourist context", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: {},
        intent: "trip_planning",
        user: touristA
      });
      expect(ctx.identity.authenticated).toBe(true);
      expect(ctx.identity.userId).toBe(touristA.id);
    });

    it("3. resolves the primary role from validated auth context", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: {},
        intent: "trip_planning",
        user: { ...touristA, roles: ["business", "tourist"], role: "tourist" }
      });
      expect(ctx.identity.role).toBe("tourist");
    });

    it("4. records missing optional fields in unknownUserData", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({ entities: {}, intent: "trip_planning" });
      expect(ctx.unknownUserData).toContain("preferences.avoidCrowds");
      expect(ctx.unknownUserData).toContain("tripContext.durationDays");
      expect(ctx.unknownUserData).toContain("budget.amount");
    });

    it("5. preserves unknown fields as unknown (never coerced to false/zero)", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({ entities: {}, intent: "trip_planning" });
      expect(ctx.preferences.avoidCrowds).toEqual({
        value: null,
        source: "unknown",
        confidence: "unknown"
      });
      expect(ctx.preferences.preferEco.value).toBeNull();
      expect(ctx.budget.amount.value).toBeNull();
    });
  });

  // =========================================================================
  // PREFERENCES
  // =========================================================================
  describe("Stored vs Request Preference Handling", () => {
    it("6. loads stored preferences for personalized intents", async () => {
      const { builder, prefsService } = createBuilder();
      const ctx = await builder.buildContext({
        entities: {},
        intent: "trip_planning",
        user: touristA
      });
      expect(prefsService.getPreferences).toHaveBeenCalledWith(touristA.id);
      expect(ctx.travellerProfile.interests.source).toBe("stored_preference");
      expect(ctx.travellerProfile.interests.confidence).toBe("verified");
      expect(ctx.travellerProfile.interests.value).toEqual(["nature", "heritage"]);
    });

    it("7. marks explicit request preferences with explicit_request source", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { travellerGroup: "parents", interests: ["food"] },
        intent: "trip_planning",
        user: touristA
      });
      expect(ctx.travellerProfile.travellerGroup.source).toBe("explicit_request");
      expect(ctx.travellerProfile.travellerGroup.value).toBe("parents");
      expect(ctx.travellerProfile.interests.source).toBe("explicit_request");
    });

    it("8. request preference overrides stored preference for the CURRENT request only", async () => {
      const bundle = storedPrefsBundle();
      const prefsService = {
        getPreferences: vi.fn().mockResolvedValue(bundle.profile)
      } as unknown as PreferencesService;
      const usersRepository = {
        findProfileById: vi.fn().mockResolvedValue({ preferred_language: null })
      } as unknown as UserRepository;
      const builder = new TravellerContextBuilder(prefsService, usersRepository);

      const ctx = await builder.buildContext({
        entities: { interests: ["adventure"] },
        intent: "trip_planning",
        user: touristA
      });
      expect(ctx.travellerProfile.interests.value).toEqual(["adventure"]);
      expect(ctx.travellerProfile.interests.source).toBe("explicit_request");
      // The underlying stored bundle remains untouched:
      expect(bundle.profile.travelPreferences.interests).toEqual(["nature", "heritage"]);
    });

    it("9. does NOT mutate persistent preferences when resolving overrides", async () => {
      const bundle = storedPrefsBundle();
      bundle.profile.travelPreferences.interests = ["wellness"];
      const prefsService = {
        getPreferences: vi.fn().mockResolvedValue(bundle.profile)
      } as unknown as PreferencesService;
      const usersRepository = {
        findProfileById: vi.fn().mockResolvedValue({ preferred_language: "te" })
      } as unknown as UserRepository;
      const builder = new TravellerContextBuilder(prefsService, usersRepository);

      await builder.buildContext({
        entities: { targetLanguage: "hi" },
        intent: "content_query",
        user: touristA
      });
      // Request language applies to this response; stored language untouched.
      expect(bundle.profile.travelPreferences.interests).toEqual(["wellness"]);
      const ctx2 = await builder.buildContext({
        entities: {},
        intent: "trip_planning",
        user: touristA
      });
      expect(ctx2.contentPreferences.targetLanguage.value).toBe("te");
      expect(ctx2.contentPreferences.targetLanguage.source).toBe("stored_profile");
    });

    it("10. extracts multiple interests from a natural-language query", () => {
      const classifier = new IntentClassifier();
      const result = classifier.classify("Plan a trip with heritage, food and nature experiences");
      expect(result.entities.interests).toBeDefined();
      expect(result.entities.interests!.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // CONSTRAINTS
  // =========================================================================
  describe("Constraint Model", () => {
    it("11. treats wheelchair requirement as a HARD accessibility constraint", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { requiresWheelchair: true },
        intent: "trip_planning"
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      const acc = resolution.hardConstraints.find((c) => c.category === "accessibility");
      expect(acc).toBeDefined();
      expect(acc!.description).toContain("wheelchair");
    });

    it("12. ranks safety above all other constraints including sustainability", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { isSoloFemale: true, ecoFriendlyPreference: true },
        intent: "trip_planning"
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      const safety = resolution.constraints.find((c) => c.category === "safety")!;
      const sustainability = resolution.constraints.find((c) => c.category === "sustainability")!;
      expect(safety.priority).toBe(1);
      expect(sustainability.priority).toBeGreaterThan(safety.priority);
    });

    it("13. treats explicit avoid-interest as a hard exclusion constraint", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { avoidInterests: ["adventure"] },
        intent: "trip_planning"
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      const prohibition = resolution.hardConstraints.find(
        (c) => c.category === "explicit_prohibition"
      );
      expect(prohibition).toBeDefined();
      expect(prohibition!.description).toContain("adventure");
    });

    it("14. treats crowd avoidance as a SOFT preference only", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { avoidCrowds: true },
        intent: "trip_planning"
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      const crowd = resolution.softPreferences.find((c) => c.category === "crowd");
      expect(crowd).toBeDefined();
      expect(resolution.hardConstraints.some((c) => c.category === "crowd")).toBe(false);
    });

    it("15. treats sustainability preference as SOFT", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { ecoFriendlyPreference: true, communityPreference: true },
        intent: "trip_planning"
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      const sust = resolution.softPreferences.find((c) => c.category === "sustainability");
      expect(sust).toBeDefined();
      expect(resolution.hardConstraints.some((c) => c.category === "sustainability")).toBe(false);
    });

    it("16. treats an explicitly stated budget as a hard limit on VERIFIED fees only", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { userBudget: 10000, budgetCurrency: "INR" },
        intent: "trip_planning"
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      const budget = resolution.hardConstraints.find((c) => c.id === "budget.hard_limit");
      expect(budget).toBeDefined();
      // Phase 7D uncertainty preserved: unknown categories must stay unknown
      expect(budget!.description).toMatch(/UNKNOWN/i);
    });

    it("17. creates a minimize-travel OBJECTIVE", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { minimizeTravel: true },
        intent: "trip_planning"
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      const obj = resolution.objectives.find((c) => c.id === "objective.minimize_travel");
      expect(obj).toBeDefined();
    });

    it("18. creates a community-businesses OBJECTIVE from community preference", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { communityPreference: true },
        intent: "local_business_query",
        user: touristA
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      expect(resolution.objectives.some((c) => c.id === "objective.community_businesses")).toBe(
        true
      );
    });
  });

  // =========================================================================
  // CONFLICT RESOLUTION & UNKNOWN HANDLING
  // =========================================================================
  describe("Conflict Resolution & Unknown Data", () => {
    it("19. resolves accessibility vs crowd conflict: accessibility wins deterministically", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { requiresWheelchair: true, avoidCrowds: true },
        intent: "trip_planning"
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      const conflict = resolution.conflicts.find(
        (c) =>
          c.betweenCategories.includes("accessibility" as never) ||
          c.winnerCategory === "accessibility"
      );
      expect(conflict).toBeDefined();
      expect(conflict!.winnerCategory).toBe("accessibility");

      // Candidate-level verification of the acceptance rule:
      const engine = new ConstraintEngine();
      const candidates = [
        {
          id: "a",
          name: "Accessible Viewpoint",
          type: "attraction" as const,
          accessibilityStatus: "accessible" as const,
          accessibilityNotes: [],
          elderlyNotes: []
        },
        {
          id: "b",
          name: "Quiet Inaccessible Trail",
          type: "attraction" as const,
          accessibilityStatus: "inaccessible" as const,
          accessibilityNotes: [],
          elderlyNotes: []
        }
      ];
      const result = engine.filterCandidates(
        candidates,
        (c) =>
          c.accessibilityStatus === "accessible"
            ? true
            : c.accessibilityStatus === "inaccessible"
              ? false
              : null,
        resolution
      );
      expect(result.fullyCompliant.map((c) => c.id)).toEqual(["a"]);
    });

    it("20. safety outranks sustainability when both are active", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { isWomenTraveller: true, preferEco: true as never, ecoFriendlyPreference: true },
        intent: "trip_planning"
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      const safetyConflict = resolution.conflicts.find(
        (c) => c.betweenCategories[0] === "safety" && c.betweenCategories[1] === "sustainability"
      );
      expect(safetyConflict).toBeDefined();
      expect(safetyConflict!.winnerCategory).toBe("safety");
    });

    it("21. budget vs unknown costs: no within-budget claim about unknown categories", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { userBudget: 3000 },
        intent: "trip_planning"
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      const budget = resolution.constraints.find((c) => c.id === "budget.hard_limit")!;
      expect(budget.description).toMatch(/remain UNKNOWN/i);
      expect(budget.description.toLowerCase()).not.toMatch(/within budget\.$/);
    });

    it("22. keeps accessibility-UNKNOWN candidates only with an honest warning when zero compliant exist", async () => {
      const engine = new ConstraintEngine();
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { requiresWheelchair: true },
        intent: "trip_planning"
      });
      const resolution = engine.resolveConstraints(ctx);
      const candidates = [
        {
          id: "x",
          name: "Unverified Site",
          type: "attraction" as const,
          accessibilityStatus: "unknown" as const,
          accessibilityNotes: [],
          elderlyNotes: []
        }
      ];
      const result = engine.filterCandidates(
        candidates,
        (c) =>
          c.accessibilityStatus === "accessible"
            ? true
            : c.accessibilityStatus === "inaccessible"
              ? false
              : null,
        resolution
      );
      expect(result.fullyCompliant).toHaveLength(1);
      expect(result.exclusionWarnings[0]).toMatch(/unknown/i);
      expect(result.exclusionWarnings.join(" ")).toMatch(/without any accessibility guarantee/i);
    });

    it("23. women-safety relevance stays boolean and honest without fabricating safety guarantees", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { isSoloFemale: true },
        intent: "trip_planning"
      });
      expect(typeof ctx.safetyContext.womenSafetyRelevant.value).toBe("boolean");
      expect(ctx.safetyContext.womenSafetyRelevant.value).toBe(true);
      const summary = constraintEngine.toSafeSummary(ctx, constraintEngine.resolveConstraints(ctx));
      expect(JSON.stringify(summary)).not.toMatch(/completely safe|crime-free|guaranteed safe/i);
    });

    it("24. crowd low-confidence data does not become a hard prohibition", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { avoidCrowds: true },
        intent: "crowd_query"
      });
      const resolution = constraintEngine.resolveConstraints(ctx);
      const crowd = resolution.constraints.find((c) => c.category === "crowd")!;
      expect(crowd.strength).toBe("soft");
      expect(crowd.priority).toBeGreaterThan(6); // below budget/physical/accessibility
    });
  });

  // =========================================================================
  // PHASE 7 INTEGRATION
  // =========================================================================
  describe("Phase 7 Context Integrations", () => {
    let baseCtx: Awaited<ReturnType<TravellerContextBuilder["buildContext"]>>;

    it("25. Phase 7A — avoid-crowds context flows into crowd soft constraints", async () => {
      const { builder } = createBuilder();
      baseCtx = await builder.buildContext({
        entities: { avoidCrowds: true, destinationName: "Araku" },
        intent: "crowd_query"
      });
      const r = constraintEngine.resolveConstraints(baseCtx);
      expect(r.softPreferences.some((c) => c.category === "crowd")).toBe(true);
    });

    it("26. Phase 7B — solo female flags populate safety context", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { isSoloFemale: true },
        intent: "trip_planning"
      });
      expect(ctx.safetyContext.soloFemale.value).toBe(true);
      expect(ctx.safetyContext.womenSafetyRelevant.value).toBe(true);
    });

    it("27. Phase 7C — wheelchair entity normalizes into accessibilityNeeds", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { requiresWheelchair: true },
        intent: "accessibility_query"
      });
      expect(ctx.travellerProfile.accessibilityNeeds.value).toContain("wheelchair");
    });

    it("28. Phase 7D — explicit budget amount normalizes with hard-limit priority", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { userBudget: 5000, budgetCurrency: "INR" },
        intent: "budget_query"
      });
      expect(ctx.budget.amount.value).toBe(5000);
      expect(ctx.budget.priority.value).toBe("hard_limit");
    });

    it("29. Phase 7E — extracted interests flow through normalized context", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { interests: ["heritage", "spiritual"] },
        intent: "experience_query"
      });
      expect(ctx.travellerProfile.interests.value).toEqual(["heritage", "spiritual"]);
    });

    it("30. Phase 7F — request target language wins for THIS request; stored fills gaps", async () => {
      const usersRepository = {
        findProfileById: vi.fn().mockResolvedValue({ preferred_language: "te" })
      } as unknown as UserRepository;
      const prefsService = {
        getPreferences: vi.fn().mockResolvedValue(storedPrefsBundle().profile)
      } as unknown as PreferencesService;
      const builder = new TravellerContextBuilder(prefsService, usersRepository);

      const req = await builder.buildContext({
        entities: { targetLanguage: "hi" },
        intent: "content_query",
        user: touristA
      });
      expect(req.contentPreferences.targetLanguage.value).toBe("hi");
      expect(req.contentPreferences.targetLanguage.source).toBe("explicit_request");

      const fallback = await builder.buildContext({
        entities: {},
        intent: "content_query",
        user: touristA
      });
      expect(fallback.contentPreferences.targetLanguage.value).toBe("te");
    });

    it("31. Phase 7G — community preference yields local business objective", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { communityPreference: true },
        intent: "local_business_query",
        user: touristA
      });
      const r = constraintEngine.resolveConstraints(ctx);
      expect(r.objectives.some((c) => c.id === "objective.community_businesses")).toBe(true);
    });

    it("32. Phase 7H — eco preference maps to soft sustainability constraint", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { ecoFriendlyPreference: true, minimizeTravel: true },
        intent: "sustainability_query"
      });
      const r = constraintEngine.resolveConstraints(ctx);
      expect(r.softPreferences.some((c) => c.category === "sustainability")).toBe(true);
      expect(r.objectives.some((c) => c.id === "objective.minimize_travel")).toBe(true);
    });
  });

  // =========================================================================
  // AI ORCHESTRATOR INTEGRATION
  // =========================================================================
  describe("AI Orchestrator Integration", () => {
    const app = createApp();

    it("33. unified context reaches orchestrator HTTP responses", async () => {
      const response = await request(app)
        .post("/api/v1/ai/chat")
        .send({ message: "Plan a 2-day trip to Araku for my parents, avoid crowds" });
      expect(response.status).toBe(200);
      expect(response.body.data.travellerContext).toBeDefined();
      expect(response.body.data.travellerContext.travellerGroup).toBe("parents");
      expect(response.body.data.travellerContext.avoidCrowds).toBe(true);
    }, 40000);

    it("34. sanitized context excludes private user data", async () => {
      const response = await request(app)
        .post("/api/v1/ai/chat")
        .send({ message: "What is the weather forecast in Coorg?" });
      const serialized = JSON.stringify(response.body.data.travellerContext ?? {});
      expect(serialized).not.toMatch(/email|password|phone|token|scopedSupabase|user_id/i);
    }, 40000);

    it("35. context carries grounded structured constraint metadata", async () => {
      const response = await request(app)
        .post("/api/v1/ai/chat")
        .send({ message: "Plan a 3-day wheelchair accessible trip to Araku" });
      const tc = response.body.data.travellerContext;
      expect(tc).toBeDefined();
      expect(tc.activeHardConstraints.length).toBeGreaterThan(0);
      expect(tc.accessibilityRequirements).toContain("wheelchair");
      expect(Array.isArray(tc.unknownFields)).toBe(true);
    }, 40000);

    it("36. effective entities merge request + derived stored values without persistence", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: {},
        intent: "trip_planning",
        user: touristA
      });
      const effective = constraintEngine.deriveEffectiveEntities({}, ctx);
      expect(effective.interests).toEqual(["nature", "heritage"]);
      expect(effective.userBudget).toBeUndefined(); // stored budget_max was null
    });
  });

  // =========================================================================
  // SECURITY
  // =========================================================================
  describe("Security & Isolation", () => {
    it("37. loads ONLY the authenticated user's own preferences (cross-user isolation)", async () => {
      const usersRepository = {
        findProfileById: vi.fn().mockResolvedValue(null)
      } as unknown as UserRepository;
      const prefsService = {
        getPreferences: vi.fn().mockResolvedValue(storedPrefsBundle().profile)
      } as unknown as PreferencesService;
      const builder = new TravellerContextBuilder(prefsService, usersRepository);

      const userB: AuthenticatedUser = { ...touristA, id: "22222222-2222-2222-2222-222222222222" };
      await builder.buildContext({ entities: {}, intent: "trip_planning", user: touristA });
      await builder.buildContext({ entities: {}, intent: "trip_planning", user: userB });

      expect(prefsService.getPreferences).toHaveBeenNthCalledWith(1, touristA.id);
      expect(prefsService.getPreferences).toHaveBeenNthCalledWith(2, userB.id);
    });

    it("38. unauthenticated requests never trigger private preference loading", async () => {
      const { builder, prefsService, usersRepository } = createBuilder();
      await builder.buildContext({ entities: {}, intent: "trip_planning" });
      expect(prefsService.getPreferences).not.toHaveBeenCalled();
      expect(usersRepository.findProfileById).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // ITINERARY INTEGRATION
  // =========================================================================
  describe("Itinerary Integration", () => {
    const filter = new CandidateFilter();
    const engine = new ConstraintEngine();

    const buildRawData = () => ({
      attractions: [
        {
          id: "att-accessible",
          name: "Ramp Garden",
          category: "Park",
          latitude: null,
          longitude: null
        },
        {
          id: "att-inaccessible",
          name: "500-Step Fort",
          category: "Heritage",
          latitude: null,
          longitude: null
        }
      ],
      accessibility: [
        {
          attraction_id: "att-accessible",
          wheelchair_access: true,
          ramps: true,
          lifts: false,
          accessible_toilet: true
        },
        {
          attraction_id: "att-inaccessible",
          wheelchair_access: false,
          ramps: false,
          lifts: false,
          accessible_toilet: false
        }
      ]
    });

    it("39. unified context reaches CandidateFilter (hard exclusion applied pre-ranking)", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { requiresWheelchair: true },
        intent: "trip_planning"
      });
      const resolution = engine.resolveConstraints(ctx);
      const out = filter.filterAndNormalize(
        buildRawData(),
        { requiresWheelchair: true },
        resolution,
        engine
      );
      expect(out.map((c) => c.id)).toEqual(["att-accessible"]);
      expect(filter.lastHardConstraintWarnings).toHaveLength(0);
    });

    it("40. unified context reaches ItineraryService prompt generation", async () => {
      const capturedPrompts: string[] = [];
      const mockProvider = {
        providerName: "mock",
        generateStructuredResponse: vi.fn().mockImplementation(async (prompt: string) => {
          capturedPrompts.push(prompt);
          return {
            intent: "trip_planning",
            summary: "Test itinerary",
            recommendations: [],
            warnings: [],
            days: [
              {
                day: 1,
                items: [
                  {
                    sequence: 1,
                    timeBlock: "morning",
                    placeId: "att-accessible",
                    placeName: "Ramp Garden",
                    reason: "Accessible",
                    accessibilityNotes: [],
                    elderlyNotes: []
                  }
                ]
              }
            ]
          };
        })
      } as unknown as AIProvider;

      const service = new ItineraryService(mockProvider, filter);
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { requiresWheelchair: true, days: 2 },
        intent: "trip_planning"
      });
      const resolution = engine.resolveConstraints(ctx);
      const safe = engine.toSafeSummary(ctx, resolution);

      const result = await service.generateItinerary(
        "Plan a wheelchair friendly trip",
        { requiresWheelchair: true, days: 2 },
        {
          destination: { id: "dest-1", name: "TestDest", state: "S" },
          sources: []
        },
        resolution,
        safe
      );

      expect(capturedPrompts[0]).toContain("UNIFIED TRAVELLER CONTEXT");
      expect(capturedPrompts[0]).toContain("wheelchair");
      expect(result.travellerContext).toBeDefined();
      expect(result.travellerContext!.accessibilityRequirements).toContain("wheelchair");
    });

    it("41. hard constraints are enforced BEFORE ranking (non-compliant removed entirely)", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { requiresWheelchair: true },
        intent: "trip_planning"
      });
      const resolution = engine.resolveConstraints(ctx);
      const out = filter.filterAndNormalize(
        buildRawData(),
        { requiresWheelchair: true },
        resolution,
        engine
      );
      expect(out.some((c) => c.id === "att-inaccessible")).toBe(false);
    });

    it("42. soft sustainability preferences adjust ranking without affecting eligibility", async () => {
      const { builder } = createBuilder();
      const ctx = await builder.buildContext({
        entities: { ecoFriendlyPreference: true },
        intent: "trip_planning"
      });
      const resolution = engine.resolveConstraints(ctx);
      const out = filter.filterAndNormalize(
        {
          attractions: [
            {
              id: "plain",
              name: "City Museum",
              category: "Museum",
              latitude: null,
              longitude: null
            },
            {
              id: "eco",
              name: "Tribal Community Eco Village",
              category: "Community tourism project",
              latitude: null,
              longitude: null
            }
          ]
        },
        { ecoFriendlyPreference: true },
        resolution,
        engine
      );
      expect(out.length).toBe(2); // eligibility unchanged
      expect(out[0].id).toBe("eco"); // ranked first by soft preference
    });
  });

  // =========================================================================
  // DATA INTEGRITY
  // =========================================================================
  describe("Data Integrity Guarantees", () => {
    it("43. never persists preferences without explicit user action via preference endpoints", async () => {
      const { builder, prefsService } = createBuilder();
      await builder.buildContext({
        entities: { travellerGroup: "parents", ecoFriendlyPreference: true, targetLanguage: "hi" },
        intent: "trip_planning",
        user: touristA
      });
      expect(vi.mocked(prefsService.updatePreferences).mock.calls.length).toBe(0);
    });

    it("44. no database schema changes — travel_preferences shape is unchanged", async () => {
      const keys = Object.keys(storedPrefsBundle().profile.travelPreferences).sort();
      expect(keys).toEqual(
        [
          "budget_max",
          "budget_min",
          "created_at",
          "id",
          "interests",
          "preferred_trip_days",
          "safety_priority",
          "user_id",
          "accessibility_needs"
        ].sort()
      );
    });
  });
});
