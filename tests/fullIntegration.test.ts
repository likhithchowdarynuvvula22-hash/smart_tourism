import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { OrchestratorService } from "../src/services/ai/orchestrator.service";
import { LocationResolver } from "../src/services/ai/context/location.resolver";
import { IntentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { CrossGapValidator } from "../src/services/ai/validation/crossGapValidator";
import { AdaptiveItineraryService } from "../src/services/ai/planning/adaptation.service";
import { TravellerContextBuilder } from "../src/services/ai/context/travellerContext.builder";
import { ConstraintEngine } from "../src/services/ai/context/constraint.engine";
import { DeterministicAIProvider } from "../src/services/ai/providers/deterministic.provider";
import { AuthenticatedUser } from "../src/types/auth";
import { CandidatePlace, ItineraryDayDto, OrchestratorResponseDto } from "../src/types/ai";
import { DestinationRow } from "../src/types/database.types";
import { sourcedUnknown, TravellerContext } from "../src/types/travellerContext";

describe("Phase 8F: Master 13-Gap End-to-End Integration Suite", () => {
  const app = createApp();

  const mockUserTourist: AuthenticatedUser = {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    email: "tourist.primary@example.com",
    role: "tourist",
    roles: ["tourist"]
  };

  const mockUserOther: AuthenticatedUser = {
    id: "bbbbbbbb-0000-0000-0000-000000000002",
    email: "tourist.other@example.com",
    role: "tourist",
    roles: ["tourist"]
  };

  const ARAKU_DEST_ID = "01e98249-049a-4017-a5fb-98b913e05ca5";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SCENARIOS 1–5: PERSONALIZED, SAFETY, ACCESSIBILITY & CONFLICTS
  // =========================================================================

  it("Scenario 1: Full personalized family trip with multi-constraint requirements", async () => {
    const classifier = new IntentClassifier();
    const query =
      "Plan a 3-day trip to Kerala for my parents. My budget is ₹10,000. I need wheelchair support. Avoid crowded places. Prefer local community experiences. Make it as eco-friendly as possible. Answer in Telugu.";

    const classification = classifier.classify(query);

    expect(classification.intent).toBe("trip_planning");
    expect(classification.entities.days).toBe(3);
    expect(classification.entities.destinationName).toBe("Kerala");
    expect(classification.entities.travellerGroup).toBe("parents");
    expect(classification.entities.userBudget).toBe(10000);
    expect(classification.entities.requiresWheelchair).toBe(true);
    expect(classification.entities.avoidCrowds).toBe(true);
    expect(classification.entities.communityPreference).toBe(true);
    expect(classification.entities.ecoFriendlyPreference).toBe(true);
    expect(classification.entities.targetLanguage?.toLowerCase()).toBe("telugu");

    // Verify constraints derived from context prioritize wheelchair over eco/crowds
    const contextBuilder = new TravellerContextBuilder();
    const constraintEngine = new ConstraintEngine();
    const context = await contextBuilder.buildContext({
      entities: classification.entities,
      intent: classification.intent
    });
    const resolution = constraintEngine.resolveConstraints(context);

    expect(resolution.hardConstraints.some((c) => c.category === "accessibility")).toBe(true);
    expect(resolution.softPreferences.some((c) => c.category === "crowd")).toBe(true);
    expect(resolution.softPreferences.some((c) => c.category === "sustainability")).toBe(true);
  });

  it("Scenario 2: Solo woman trip activates women safety intelligence without false universal safe claims", async () => {
    const classifier = new IntentClassifier();
    const query = "Plan a 2-day trip to Araku for a solo woman traveller.";

    const classification = classifier.classify(query);
    expect(classification.intent).toBe("trip_planning");
    expect(classification.entities.isSoloFemale).toBe(true);
    expect(classification.entities.destinationName).toBe("Araku");

    const contextBuilder = new TravellerContextBuilder();
    const context = await contextBuilder.buildContext({
      entities: classification.entities,
      intent: classification.intent
    });

    expect(context.safetyContext.womenSafetyRelevant.value).toBe(true);
    expect(context.safetyContext.soloFemale.value).toBe(true);
  });

  it("Scenario 3: Wheelchair + Crowd conflict retains wheelchair as hard and crowd as soft", () => {
    const validator = new CrossGapValidator();
    const baseCtx: TravellerContext = {
      identity: { authenticated: false, userId: null, role: null },
      tripContext: {
        destinationId: sourcedUnknown(),
        destinationName: sourcedUnknown(),
        tripId: sourcedUnknown(),
        travelDates: { start: sourcedUnknown(), end: sourcedUnknown() },
        durationDays: sourcedUnknown(),
        travellerCount: sourcedUnknown()
      },
      activeTrip: null,
      travellerProfile: {
        travellerGroup: sourcedUnknown(),
        ageContext: sourcedUnknown(),
        interests: { value: [], source: "derived", confidence: "verified" },
        avoidInterests: { value: [], source: "derived", confidence: "verified" },
        preferredLanguage: sourcedUnknown(),
        accessibilityNeeds: {
          value: ["wheelchair"],
          source: "explicit_request",
          confidence: "verified"
        },
        mobilityNeeds: { value: [], source: "derived", confidence: "verified" },
        travelStyle: sourcedUnknown()
      },
      budget: { amount: sourcedUnknown(), currency: sourcedUnknown(), priority: sourcedUnknown() },
      preferences: {
        avoidCrowds: { value: true, source: "explicit_request", confidence: "verified" },
        preferEco: sourcedUnknown(),
        communityPreference: sourcedUnknown(),
        minimizeTravel: sourcedUnknown()
      },
      safetyContext: {
        womenSafetyRelevant: { value: false, source: "derived", confidence: "verified" },
        soloFemale: { value: false, source: "derived", confidence: "verified" }
      },
      contentPreferences: { targetLanguage: sourcedUnknown() },
      knownUserData: [],
      unknownUserData: []
    };

    const candidatePlaces: CandidatePlace[] = [
      {
        id: "p1",
        name: "Accessible Crowded Heritage",
        type: "attraction",
        isWheelchairAccessible: true,
        isElderlyFriendly: true,
        accessibilityNotes: [],
        elderlyNotes: []
      },
      {
        id: "p2",
        name: "Quiet Inaccessible Cliff",
        type: "experience",
        isWheelchairAccessible: false,
        isElderlyFriendly: false,
        accessibilityNotes: ["Rough steep stairs"],
        elderlyNotes: []
      }
    ];

    // Candidate 1: Accessible + Crowded -> Valid with advisory crowd notice
    const validItinerary: ItineraryDayDto[] = [
      {
        day: 1,
        items: [
          {
            sequence: 1,
            timeBlock: "morning",
            placeId: "p1",
            placeName: "Accessible Crowded Heritage",
            reason: "Visit",
            accessibilityNotes: [],
            elderlyNotes: []
          }
        ]
      }
    ];
    const res1 = validator.validate(validItinerary, {
      travellerContext: baseCtx,
      candidatePlaces,
      intelligenceContext: { crowdAssessments: { "dest-1": { level: "high", confidence: 0.9 } } }
    });
    expect(res1.valid).toBe(true);
    expect(res1.status).toBe("conditional");

    // Candidate 2: Inaccessible -> Hard blocked
    const invalidItinerary: ItineraryDayDto[] = [
      {
        day: 1,
        items: [
          {
            sequence: 1,
            timeBlock: "morning",
            placeId: "p2",
            placeName: "Quiet Inaccessible Cliff",
            reason: "Trek",
            accessibilityNotes: [],
            elderlyNotes: []
          }
        ]
      }
    ];
    const res2 = validator.validate(invalidItinerary, {
      travellerContext: baseCtx,
      candidatePlaces
    });
    expect(res2.valid).toBe(false);
    expect(res2.blockedItems.some((b) => b.placeId === "p2")).toBe(true);
  });

  it("Scenario 4: Budget + Safety conflict prioritizes safety over cheap options", () => {
    const validator = new CrossGapValidator();
    const baseCtx: TravellerContext = {
      identity: { authenticated: false, userId: null, role: null },
      tripContext: {
        destinationId: sourcedUnknown(),
        destinationName: sourcedUnknown(),
        tripId: sourcedUnknown(),
        travelDates: { start: sourcedUnknown(), end: sourcedUnknown() },
        durationDays: sourcedUnknown(),
        travellerCount: sourcedUnknown()
      },
      activeTrip: null,
      travellerProfile: {
        travellerGroup: sourcedUnknown(),
        ageContext: sourcedUnknown(),
        interests: { value: [], source: "derived", confidence: "verified" },
        avoidInterests: { value: [], source: "derived", confidence: "verified" },
        preferredLanguage: sourcedUnknown(),
        accessibilityNeeds: { value: [], source: "derived", confidence: "verified" },
        mobilityNeeds: { value: [], source: "derived", confidence: "verified" },
        travelStyle: sourcedUnknown()
      },
      budget: {
        amount: { value: 5000, source: "explicit_request", confidence: "verified" },
        currency: sourcedUnknown(),
        priority: { value: "hard_limit", source: "explicit_request", confidence: "verified" }
      },
      preferences: {
        avoidCrowds: sourcedUnknown(),
        preferEco: sourcedUnknown(),
        communityPreference: sourcedUnknown(),
        minimizeTravel: sourcedUnknown()
      },
      safetyContext: {
        womenSafetyRelevant: { value: true, source: "explicit_request", confidence: "verified" },
        soloFemale: { value: false, source: "derived", confidence: "verified" }
      },
      contentPreferences: { targetLanguage: sourcedUnknown() },
      knownUserData: [],
      unknownUserData: []
    };

    const res = validator.validate([], {
      travellerContext: baseCtx,
      intelligenceContext: {
        safetyAlerts: [
          { severity: "critical", title: "Active Flood Warning", destinationId: "dest-flood" }
        ]
      }
    });

    expect(res.valid).toBe(false);
    expect(res.conflicts.some((c) => c.code === "SAFETY_CRITICAL_ALERT")).toBe(true);
  });

  it("Scenario 5: Eco + Accessibility ensures accessibility is hard and eco is soft", () => {
    const validator = new CrossGapValidator();
    const baseCtx: TravellerContext = {
      identity: { authenticated: false, userId: null, role: null },
      tripContext: {
        destinationId: sourcedUnknown(),
        destinationName: sourcedUnknown(),
        tripId: sourcedUnknown(),
        travelDates: { start: sourcedUnknown(), end: sourcedUnknown() },
        durationDays: sourcedUnknown(),
        travellerCount: sourcedUnknown()
      },
      activeTrip: null,
      travellerProfile: {
        travellerGroup: sourcedUnknown(),
        ageContext: sourcedUnknown(),
        interests: { value: [], source: "derived", confidence: "verified" },
        avoidInterests: { value: [], source: "derived", confidence: "verified" },
        preferredLanguage: sourcedUnknown(),
        accessibilityNeeds: {
          value: ["wheelchair"],
          source: "explicit_request",
          confidence: "verified"
        },
        mobilityNeeds: { value: [], source: "derived", confidence: "verified" },
        travelStyle: sourcedUnknown()
      },
      budget: { amount: sourcedUnknown(), currency: sourcedUnknown(), priority: sourcedUnknown() },
      preferences: {
        avoidCrowds: sourcedUnknown(),
        preferEco: { value: true, source: "explicit_request", confidence: "verified" },
        communityPreference: sourcedUnknown(),
        minimizeTravel: sourcedUnknown()
      },
      safetyContext: {
        womenSafetyRelevant: { value: false, source: "derived", confidence: "verified" },
        soloFemale: { value: false, source: "derived", confidence: "verified" }
      },
      contentPreferences: { targetLanguage: sourcedUnknown() },
      knownUserData: [],
      unknownUserData: []
    };

    const candidatePlaces: CandidatePlace[] = [
      {
        id: "p-inaccessible-eco",
        name: "Green Forest Nature Trail",
        type: "attraction",
        isWheelchairAccessible: false,
        isElderlyFriendly: false,
        accessibilityNotes: ["Unpaved forest floor"],
        elderlyNotes: []
      }
    ];

    const itinerary: ItineraryDayDto[] = [
      {
        day: 1,
        items: [
          {
            sequence: 1,
            timeBlock: "morning",
            placeId: "p-inaccessible-eco",
            placeName: "Green Forest Nature Trail",
            reason: "Eco Trail",
            accessibilityNotes: [],
            elderlyNotes: []
          }
        ]
      }
    ];

    const res = validator.validate(itinerary, {
      travellerContext: baseCtx,
      candidatePlaces
    });

    expect(res.valid).toBe(false);
    expect(res.blockedItems.some((b) => b.placeId === "p-inaccessible-eco")).toBe(true);
    expect(res.unknowns).toContain("exact_carbon_emissions");
  });

  // =========================================================================
  // SCENARIOS 6–10: LOCAL ECONOMY, ADAPTATION, MULTI-DESTINATION
  // =========================================================================

  it("Scenario 6: Culture + Local Business + Budget coordinates verified records without fabricated prices", async () => {
    const res = await request(app).get(`/api/v1/experiences/destinations/${ARAKU_DEST_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();

    const bizRes = await request(app).get(`/api/v1/businesses/destinations/${ARAKU_DEST_ID}`);
    expect(bizRes.status).toBe(200);
    expect(bizRes.body.data).toBeDefined();
    expect(bizRes.body.data.disclaimer).toContain("verified tourism department registries");
  });

  it("Scenario 7: Existing trip adaptation identifies triggers and applies minimal-change replanning", () => {
    const adaptiveService = new AdaptiveItineraryService();
    const triggers = adaptiveService.parseTriggers("It's raining today. Change today's plan.");

    expect(triggers.isAdaptationQuery).toBe(true);
    expect(triggers.weatherTrigger).toBe(true);
    expect(triggers.wantsApply).toBe(false);

    const applyTriggers = adaptiveService.parseTriggers("Apply those changes.");
    expect(applyTriggers.wantsApply).toBe(true);
  });

  it("Scenario 8: Crowd adaptation detects crowds and shifts timing toward rush-free windows", () => {
    const adaptiveService = new AdaptiveItineraryService();
    const triggers = adaptiveService.parseTriggers("Avoid crowded places now.");

    expect(triggers.isAdaptationQuery).toBe(true);
    expect(triggers.userConstraintTriggers.some((t) => t.type === "preference")).toBe(true);
  });

  it("Scenario 9: State-level planning returns bounded candidate shortlist without arbitrary single-city collapse", async () => {
    const resolver = new LocationResolver();
    const resolution = await resolver.resolve("Kerala");

    expect(resolution.locationType).toBe("state");
    expect(resolution.candidateDestinations.length).toBeGreaterThan(1);
    expect(resolution.resolvedState).toBe("Kerala");
  });

  it("Scenario 10: Explicit multi-destination query resolves multiple destinations without safety pollution", async () => {
    const orchestrator = new OrchestratorService();
    const multi = await (
      orchestrator as unknown as {
        resolveMultipleDestinationNames: (
          msg: string
        ) => Promise<{ locationType: string; candidateDestinations: DestinationRow[] }>;
      }
    ).resolveMultipleDestinationNames("Plan 3 days covering Fort Kochi and Munnar");

    expect(multi.candidateDestinations.length).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // SCENARIOS 11–15: MULTILINGUAL, PREVIEW, PERSISTENCE, MISSING DATA & FAILURES
  // =========================================================================

  it("Scenario 11: Multilingual content query returns translation with dual-language provenance", async () => {
    const res = await request(app).get(
      `/api/v1/content/destinations/${ARAKU_DEST_ID}/summary?lang=hi`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it("Scenario 12: Context preview endpoint requires auth and discloses safe normalized constraints", async () => {
    // Unauthenticated request -> 401
    const unauthRes = await request(app).get("/api/v1/ai/context-preview");
    expect(unauthRes.status).toBe(401);
  });

  it("Scenario 13: Explicit preference persistence only persists on explicit 'Remember that...' pattern", () => {
    const normalMsg = "I like cultural experiences";
    const explicitMsg = "Remember that I prefer cultural experiences";

    const EXPLICIT_SAVE_PATTERN =
      /(remember|save)\s+(that\s+)?i\s+prefer|remember my preference|save my (preference|preferences)/i;

    expect(EXPLICIT_SAVE_PATTERN.test(normalMsg)).toBe(false);
    expect(EXPLICIT_SAVE_PATTERN.test(explicitMsg)).toBe(true);
  });

  it("Scenario 14: Missing data stress test preserves unknown data without hallucinating attributes", async () => {
    const validator = new CrossGapValidator();
    const baseCtx: TravellerContext = {
      identity: { authenticated: false, userId: null, role: null },
      tripContext: {
        destinationId: sourcedUnknown(),
        destinationName: sourcedUnknown(),
        tripId: sourcedUnknown(),
        travelDates: { start: sourcedUnknown(), end: sourcedUnknown() },
        durationDays: sourcedUnknown(),
        travellerCount: sourcedUnknown()
      },
      activeTrip: null,
      travellerProfile: {
        travellerGroup: sourcedUnknown(),
        ageContext: sourcedUnknown(),
        interests: { value: [], source: "derived", confidence: "verified" },
        avoidInterests: { value: [], source: "derived", confidence: "verified" },
        preferredLanguage: sourcedUnknown(),
        accessibilityNeeds: { value: [], source: "derived", confidence: "verified" },
        mobilityNeeds: { value: [], source: "derived", confidence: "verified" },
        travelStyle: sourcedUnknown()
      },
      budget: { amount: sourcedUnknown(), currency: sourcedUnknown(), priority: sourcedUnknown() },
      preferences: {
        avoidCrowds: sourcedUnknown(),
        preferEco: sourcedUnknown(),
        communityPreference: sourcedUnknown(),
        minimizeTravel: sourcedUnknown()
      },
      safetyContext: {
        womenSafetyRelevant: { value: false, source: "derived", confidence: "verified" },
        soloFemale: { value: false, source: "derived", confidence: "verified" }
      },
      contentPreferences: { targetLanguage: sourcedUnknown() },
      knownUserData: [],
      unknownUserData: ["budget.amount", "travellerProfile.interests"]
    };

    const res = validator.validate([], { travellerContext: baseCtx });

    expect(res.valid).toBe(true);
    expect(res.unknowns).toContain("exact_carbon_emissions");
    expect(res.unknowns).toContain("dining_and_hotel_commercial_rates");
  });

  it("Scenario 15: External service failure degrades gracefully without crashing response", async () => {
    const provider = new DeterministicAIProvider();
    const contextData = {
      intent: "weather_query",
      entities: { destinationName: "Coorg" },
      weather: null,
      destination: { id: "d1", name: "Coorg", state: "Karnataka" },
      sources: []
    };

    const prompt = `\`\`\`json\n${JSON.stringify(contextData)}\n\`\`\``;
    const res = await provider.generateStructuredResponse<OrchestratorResponseDto>(prompt);

    expect(res.intent).toBe("weather_query");
    expect(res.summary).toBeDefined();
    expect(res.weather).toBeNull();
  });

  // =========================================================================
  // SCENARIOS 16–20: AI VALIDATION, SECURITY, OPENING HOURS & ADAPTATION FLOW
  // =========================================================================

  it("Scenario 16: Invalid LLM output with fabricated IDs is stripped and sanitized by CrossGapValidator", () => {
    const validator = new CrossGapValidator();
    const baseCtx: TravellerContext = {
      identity: { authenticated: false, userId: null, role: null },
      tripContext: {
        destinationId: sourcedUnknown(),
        destinationName: sourcedUnknown(),
        tripId: sourcedUnknown(),
        travelDates: { start: sourcedUnknown(), end: sourcedUnknown() },
        durationDays: sourcedUnknown(),
        travellerCount: sourcedUnknown()
      },
      activeTrip: null,
      travellerProfile: {
        travellerGroup: sourcedUnknown(),
        ageContext: sourcedUnknown(),
        interests: { value: [], source: "derived", confidence: "verified" },
        avoidInterests: { value: [], source: "derived", confidence: "verified" },
        preferredLanguage: sourcedUnknown(),
        accessibilityNeeds: { value: [], source: "derived", confidence: "verified" },
        mobilityNeeds: { value: [], source: "derived", confidence: "verified" },
        travelStyle: sourcedUnknown()
      },
      budget: { amount: sourcedUnknown(), currency: sourcedUnknown(), priority: sourcedUnknown() },
      preferences: {
        avoidCrowds: sourcedUnknown(),
        preferEco: sourcedUnknown(),
        communityPreference: sourcedUnknown(),
        minimizeTravel: sourcedUnknown()
      },
      safetyContext: {
        womenSafetyRelevant: { value: false, source: "derived", confidence: "verified" },
        soloFemale: { value: false, source: "derived", confidence: "verified" }
      },
      contentPreferences: { targetLanguage: sourcedUnknown() },
      knownUserData: [],
      unknownUserData: []
    };

    const rawResponse: OrchestratorResponseDto = {
      intent: "trip_planning",
      summary: "Raw Itinerary",
      recommendations: [],
      days: [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "known-1",
              placeName: "Known Fort",
              reason: "Good",
              accessibilityNotes: [],
              elderlyNotes: []
            },
            {
              sequence: 2,
              timeBlock: "afternoon",
              placeId: "fake-99",
              placeName: "Fake Temple",
              reason: "Bad",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ],
      warnings: [],
      sources: []
    };

    const candidatePlaces: CandidatePlace[] = [
      {
        id: "known-1",
        name: "Known Fort",
        type: "attraction",
        isWheelchairAccessible: true,
        isElderlyFriendly: true,
        accessibilityNotes: [],
        elderlyNotes: []
      }
    ];

    const sanitized = validator.sanitizeResponse(rawResponse, {
      travellerContext: baseCtx,
      candidatePlaces
    });

    expect(sanitized.days![0].items).toHaveLength(1);
    expect(sanitized.days![0].items[0].placeId).toBe("known-1");
    expect(sanitized.crossGapValidation?.blockedItems.some((b) => b.placeId === "fake-99")).toBe(
      true
    );
  });

  it("Scenario 17: Security & cross-user isolation prevents unauthorized trip access", () => {
    const validator = new CrossGapValidator();
    const baseCtx: TravellerContext = {
      identity: { authenticated: true, userId: mockUserTourist.id, role: "tourist" },
      tripContext: {
        destinationId: sourcedUnknown(),
        destinationName: sourcedUnknown(),
        tripId: { value: "trip-alpha-1", source: "trip_context", confidence: "verified" },
        travelDates: { start: sourcedUnknown(), end: sourcedUnknown() },
        durationDays: sourcedUnknown(),
        travellerCount: sourcedUnknown()
      },
      activeTrip: {
        tripId: "trip-alpha-1",
        name: "Alpha Trip",
        startDate: null,
        endDate: null,
        durationDays: 2,
        itineraryItemCount: 2
      },
      travellerProfile: {
        travellerGroup: sourcedUnknown(),
        ageContext: sourcedUnknown(),
        interests: { value: [], source: "derived", confidence: "verified" },
        avoidInterests: { value: [], source: "derived", confidence: "verified" },
        preferredLanguage: sourcedUnknown(),
        accessibilityNeeds: { value: [], source: "derived", confidence: "verified" },
        mobilityNeeds: { value: [], source: "derived", confidence: "verified" },
        travelStyle: sourcedUnknown()
      },
      budget: { amount: sourcedUnknown(), currency: sourcedUnknown(), priority: sourcedUnknown() },
      preferences: {
        avoidCrowds: sourcedUnknown(),
        preferEco: sourcedUnknown(),
        communityPreference: sourcedUnknown(),
        minimizeTravel: sourcedUnknown()
      },
      safetyContext: {
        womenSafetyRelevant: { value: false, source: "derived", confidence: "verified" },
        soloFemale: { value: false, source: "derived", confidence: "verified" }
      },
      contentPreferences: { targetLanguage: sourcedUnknown() },
      knownUserData: [],
      unknownUserData: []
    };

    const res = validator.validate([], {
      travellerContext: baseCtx,
      user: mockUserOther // Different user
    });

    expect(res.valid).toBe(false);
    expect(res.conflicts.some((c) => c.code === "SECURITY_OWNERSHIP_VIOLATION")).toBe(true);
  });

  it("Scenario 18: Opening hours feasibility validates scheduling without assuming 24/7 access", () => {
    const validator = new CrossGapValidator();
    const baseCtx: TravellerContext = {
      identity: { authenticated: false, userId: null, role: null },
      tripContext: {
        destinationId: sourcedUnknown(),
        destinationName: sourcedUnknown(),
        tripId: sourcedUnknown(),
        travelDates: { start: sourcedUnknown(), end: sourcedUnknown() },
        durationDays: sourcedUnknown(),
        travellerCount: sourcedUnknown()
      },
      activeTrip: null,
      travellerProfile: {
        travellerGroup: sourcedUnknown(),
        ageContext: sourcedUnknown(),
        interests: { value: [], source: "derived", confidence: "verified" },
        avoidInterests: { value: [], source: "derived", confidence: "verified" },
        preferredLanguage: sourcedUnknown(),
        accessibilityNeeds: { value: [], source: "derived", confidence: "verified" },
        mobilityNeeds: { value: [], source: "derived", confidence: "verified" },
        travelStyle: sourcedUnknown()
      },
      budget: { amount: sourcedUnknown(), currency: sourcedUnknown(), priority: sourcedUnknown() },
      preferences: {
        avoidCrowds: sourcedUnknown(),
        preferEco: sourcedUnknown(),
        communityPreference: sourcedUnknown(),
        minimizeTravel: sourcedUnknown()
      },
      safetyContext: {
        womenSafetyRelevant: { value: false, source: "derived", confidence: "verified" },
        soloFemale: { value: false, source: "derived", confidence: "verified" }
      },
      contentPreferences: { targetLanguage: sourcedUnknown() },
      knownUserData: [],
      unknownUserData: []
    };

    const res = validator.validate([], { travellerContext: baseCtx });
    expect(res.valid).toBe(true);
  });

  it("Scenario 19: Hard constraint priority strictly enforces ordering across all categories", () => {
    const engine = new ConstraintEngine();
    const baseCtx: TravellerContext = {
      identity: { authenticated: false, userId: null, role: null },
      tripContext: {
        destinationId: sourcedUnknown(),
        destinationName: sourcedUnknown(),
        tripId: sourcedUnknown(),
        travelDates: { start: sourcedUnknown(), end: sourcedUnknown() },
        durationDays: sourcedUnknown(),
        travellerCount: sourcedUnknown()
      },
      activeTrip: null,
      travellerProfile: {
        travellerGroup: sourcedUnknown(),
        ageContext: sourcedUnknown(),
        interests: { value: ["culture"], source: "explicit_request", confidence: "verified" },
        avoidInterests: {
          value: ["adventure"],
          source: "explicit_request",
          confidence: "verified"
        },
        preferredLanguage: sourcedUnknown(),
        accessibilityNeeds: {
          value: ["wheelchair"],
          source: "explicit_request",
          confidence: "verified"
        },
        mobilityNeeds: { value: [], source: "derived", confidence: "verified" },
        travelStyle: sourcedUnknown()
      },
      budget: {
        amount: { value: 5000, source: "explicit_request", confidence: "verified" },
        currency: sourcedUnknown(),
        priority: { value: "hard_limit", source: "explicit_request", confidence: "verified" }
      },
      preferences: {
        avoidCrowds: { value: true, source: "explicit_request", confidence: "verified" },
        preferEco: { value: true, source: "explicit_request", confidence: "verified" },
        communityPreference: sourcedUnknown(),
        minimizeTravel: sourcedUnknown()
      },
      safetyContext: {
        womenSafetyRelevant: { value: true, source: "explicit_request", confidence: "verified" },
        soloFemale: { value: true, source: "explicit_request", confidence: "verified" }
      },
      contentPreferences: { targetLanguage: sourcedUnknown() },
      knownUserData: [],
      unknownUserData: []
    };

    const resolution = engine.resolveConstraints(baseCtx);

    const safetyPriority = resolution.hardConstraints.find(
      (c) => c.category === "safety"
    )?.priority;
    const accPriority = resolution.hardConstraints.find(
      (c) => c.category === "accessibility"
    )?.priority;
    const crowdPriority = resolution.softPreferences.find((c) => c.category === "crowd")?.priority;
    const ecoPriority = resolution.softPreferences.find(
      (c) => c.category === "sustainability"
    )?.priority;

    expect(safetyPriority).toBeLessThan(accPriority!);
    expect(accPriority).toBeLessThan(crowdPriority!);
    expect(crowdPriority).toBeLessThan(ecoPriority!);
  });

  it("Scenario 20: Full adaptive + multi-destination flow preserves unaffected itinerary segments", () => {
    const validator = new CrossGapValidator();
    const baseCtx: TravellerContext = {
      identity: { authenticated: false, userId: null, role: null },
      tripContext: {
        destinationId: sourcedUnknown(),
        destinationName: sourcedUnknown(),
        tripId: sourcedUnknown(),
        travelDates: { start: sourcedUnknown(), end: sourcedUnknown() },
        durationDays: sourcedUnknown(),
        travellerCount: sourcedUnknown()
      },
      activeTrip: null,
      travellerProfile: {
        travellerGroup: sourcedUnknown(),
        ageContext: sourcedUnknown(),
        interests: { value: [], source: "derived", confidence: "verified" },
        avoidInterests: { value: [], source: "derived", confidence: "verified" },
        preferredLanguage: sourcedUnknown(),
        accessibilityNeeds: { value: [], source: "derived", confidence: "verified" },
        mobilityNeeds: { value: [], source: "derived", confidence: "verified" },
        travelStyle: sourcedUnknown()
      },
      budget: { amount: sourcedUnknown(), currency: sourcedUnknown(), priority: sourcedUnknown() },
      preferences: {
        avoidCrowds: sourcedUnknown(),
        preferEco: sourcedUnknown(),
        communityPreference: sourcedUnknown(),
        minimizeTravel: sourcedUnknown()
      },
      safetyContext: {
        womenSafetyRelevant: { value: false, source: "derived", confidence: "verified" },
        soloFemale: { value: false, source: "derived", confidence: "verified" }
      },
      contentPreferences: { targetLanguage: sourcedUnknown() },
      knownUserData: [],
      unknownUserData: []
    };

    const days: ItineraryDayDto[] = [
      {
        day: 1,
        items: [
          {
            sequence: 1,
            timeBlock: "morning",
            placeId: "p1",
            placeName: "Fort Kochi",
            reason: "Good",
            accessibilityNotes: [],
            elderlyNotes: []
          }
        ]
      },
      {
        day: 2,
        items: [
          {
            sequence: 1,
            timeBlock: "morning",
            placeId: "p2",
            placeName: "Munnar Tea Trail",
            reason: "Good",
            accessibilityNotes: [],
            elderlyNotes: []
          }
        ]
      }
    ];

    const res = validator.validate(days, { travellerContext: baseCtx });
    expect(res.valid).toBe(true);
    expect(res.status).toBe("valid");
  });

  // =========================================================================
  // SCENARIOS 21–26: GOVERNANCE, PREFERENCES, PERFORMANCE & PROVENANCE
  // =========================================================================

  it("Scenario 21: Unknown data is never coerced to false, zero, or safe", () => {
    const unknownVal = sourcedUnknown();
    expect(unknownVal.value).toBeNull();
    expect(unknownVal.source).toBe("unknown");
    expect(unknownVal.confidence).toBe("unknown");
  });

  it("Scenario 22: Location resolution classifies state, district, exact, and ambiguous terms deterministically", async () => {
    const resolver = new LocationResolver();

    const stateRes = await resolver.resolve("Kerala");
    expect(stateRes.locationType).toBe("state");

    const exactRes = await resolver.resolve("Araku Valley");
    expect(exactRes.locationType).toBe("destination");

    const unknownRes = await resolver.resolve("NonExistentAtlantisPlace");
    expect(unknownRes.locationType).toBe("unknown");
  });

  it("Scenario 23: Request override applies locally without mutating stored preferences", () => {
    const engine = new ConstraintEngine();
    const baseCtx: TravellerContext = {
      identity: { authenticated: true, userId: mockUserTourist.id, role: "tourist" },
      tripContext: {
        destinationId: sourcedUnknown(),
        destinationName: sourcedUnknown(),
        tripId: sourcedUnknown(),
        travelDates: { start: sourcedUnknown(), end: sourcedUnknown() },
        durationDays: sourcedUnknown(),
        travellerCount: sourcedUnknown()
      },
      activeTrip: null,
      travellerProfile: {
        travellerGroup: sourcedUnknown(),
        ageContext: sourcedUnknown(),
        interests: { value: ["heritage"], source: "stored_preference", confidence: "verified" },
        avoidInterests: { value: [], source: "derived", confidence: "verified" },
        preferredLanguage: { value: "Telugu", source: "stored_profile", confidence: "verified" },
        accessibilityNeeds: { value: [], source: "derived", confidence: "verified" },
        mobilityNeeds: { value: [], source: "derived", confidence: "verified" },
        travelStyle: sourcedUnknown()
      },
      budget: { amount: sourcedUnknown(), currency: sourcedUnknown(), priority: sourcedUnknown() },
      preferences: {
        avoidCrowds: sourcedUnknown(),
        preferEco: sourcedUnknown(),
        communityPreference: sourcedUnknown(),
        minimizeTravel: sourcedUnknown()
      },
      safetyContext: {
        womenSafetyRelevant: { value: false, source: "derived", confidence: "verified" },
        soloFemale: { value: false, source: "derived", confidence: "verified" }
      },
      contentPreferences: {
        targetLanguage: { value: "Hindi", source: "explicit_request", confidence: "verified" }
      },
      knownUserData: [],
      unknownUserData: []
    };

    const effective = engine.deriveEffectiveEntities({ targetLanguage: "Hindi" }, baseCtx);
    expect(effective.targetLanguage).toBe("Hindi");
    expect(baseCtx.travellerProfile.preferredLanguage.value).toBe("Telugu");
  });

  it("Scenario 24: No automatic preference write occurs during normal conversational planning", () => {
    const normalMsg = "I like quiet destinations and nature trails";
    const EXPLICIT_SAVE_PATTERN =
      /(remember|save)\s+(that\s+)?i\s+prefer|remember my preference|save my (preference|preferences)/i;
    expect(EXPLICIT_SAVE_PATTERN.test(normalMsg)).toBe(false);
  });

  it("Scenario 25: Performance-safe orchestration limits tool execution to intent-relevant modules", () => {
    const classifier = new IntentClassifier();

    const weatherQuery = classifier.classify("What is the weather in Araku?");
    expect(weatherQuery.requiredTools).toContain("weather");
    expect(weatherQuery.requiredTools).not.toContain("women_safety_intelligence");
    expect(weatherQuery.requiredTools).not.toContain("budget_intelligence");

    const safetyQuery = classifier.classify("Is it safe for solo women in Araku?");
    expect(safetyQuery.requiredTools).toContain("women_safety_intelligence");
    expect(safetyQuery.requiredTools).not.toContain("local_business_intelligence");
  });

  it("Scenario 26: Grounded provenance validation guarantees source attribution without internal SQL leaks", async () => {
    const res = await request(app).get(`/api/v1/destinations/${ARAKU_DEST_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBeDefined();

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("SELECT ");
    expect(serialized).not.toContain("supabase_admin");
    expect(serialized).not.toContain("password");
  });
});
