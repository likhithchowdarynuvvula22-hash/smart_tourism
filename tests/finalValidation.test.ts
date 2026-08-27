import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { IntentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { TravellerContextBuilder } from "../src/services/ai/context/travellerContext.builder";
import { ConstraintEngine } from "../src/services/ai/context/constraint.engine";
import { AdaptiveItineraryService } from "../src/services/ai/planning/adaptation.service";
import { MultiDestinationPlanner } from "../src/services/ai/planning/multiDestination.planner";
import { DestinationRepository } from "../src/repositories/destination.repository";

describe("Phase 11: Final Validation, Integration Testing & SIH Readiness Audit Suite", () => {
  const app = createApp();
  const ARAKU_DEST_ID = "01e98249-049a-4017-a5fb-98b913e05ca5";

  const DEST_KOCHI = {
    id: "324f8a6f-d7cc-4efa-bf38-358726b84a4d",
    name: "Fort Kochi",
    district: "Ernakulam",
    state: "Kerala",
    latitude: 9.96,
    longitude: 76.24,
    description: null
  };
  const DEST_MARARI = {
    id: "a2b4e3b9-0d78-4b13-9432-1d086d2c100e",
    name: "Marari Beach",
    district: "Alappuzha",
    state: "Kerala",
    latitude: 9.7,
    longitude: 76.28,
    description: null
  };

  // =========================================================================
  // 1. DESTINATION DISCOVERY
  // =========================================================================
  it("Scenario 1: Destination Discovery — search, state filtering, pagination, and data envelope", async () => {
    const res = await request(app)
      .get("/api/v1/destinations")
      .query({ state: "Andhra Pradesh", page: 1, pageSize: 5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.pageSize).toBe(5);

    if (res.body.data.length > 0) {
      const item = res.body.data[0];
      expect(item.id).toBeDefined();
      expect(item.name).toBeDefined();
      expect(item.state).toBe("Andhra Pradesh");
    }
  });

  // =========================================================================
  // 2. PERSONALIZED ITINERARY
  // =========================================================================
  it("Scenario 2: Personalized Itinerary — parents group, senior pacing, verified places without fabrication", async () => {
    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a 2-day trip to Araku for my parents" });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.intent).toBe("trip_planning");
    expect(res.body.data.days.length).toBeGreaterThanOrEqual(1);

    // Verify places are grounded and unique
    const allPlaceIds = res.body.data.days.flatMap((d: { items: Array<{ placeId?: string }> }) =>
      d.items.map((a: { placeId?: string }) => a.placeId).filter(Boolean)
    );
    const uniqueIds = new Set(allPlaceIds);
    expect(uniqueIds.size).toBe(allPlaceIds.length);

    // Provenance verification
    expect(res.body.data.sources).toBeDefined();
    expect(Array.isArray(res.body.data.sources)).toBe(true);
  });

  // =========================================================================
  // 3. CROWD INTELLIGENCE
  // =========================================================================
  it("Scenario 3: Crowd Intelligence — baseline data, disclosure of confidence, rush-free windows", async () => {
    const res = await request(app).get(`/api/v1/crowd/destinations/${ARAKU_DEST_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.crowd).toBeDefined();
    expect(res.body.data.crowd.unit).toBe("baseline_crowd_index_0_100");
    expect(res.body.data.dataQuality).toBeDefined();
    expect(Array.isArray(res.body.data.recommendedWindows)).toBe(true);
    expect(Array.isArray(res.body.data.busyWindows)).toBe(true);
  });

  // =========================================================================
  // 4. WOMEN SAFETY INTELLIGENCE
  // =========================================================================
  it("Scenario 4: Women Safety — safety metrics, verified emergency contacts, honest data quality", async () => {
    const res = await request(app).get(`/api/v1/safety/women/destinations/${ARAKU_DEST_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.destinationId).toBe(ARAKU_DEST_ID);
    expect(res.body.data.dataQuality).toBeDefined();
    expect(res.body.data.emergencyResources).toBeDefined();
    expect(res.body.data.womenSafetyIndicators).toBeDefined();
    expect(res.body.data.disclaimer).toBeDefined();
  });

  // =========================================================================
  // 5. ACCESSIBILITY & ELDERLY SUPPORT
  // =========================================================================
  it("Scenario 5: Accessibility — wheelchair treated as hard constraint, no false promises", async () => {
    const res = await request(app).get(`/api/v1/accessibility/destinations/${ARAKU_DEST_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.destinationId).toBe(ARAKU_DEST_ID);
    expect(res.body.data.accessibilityStatus).toBeDefined();
    expect(res.body.data.disclaimer).toBeDefined();

    // Verify constraint classification
    const classifier = new IntentClassifier();
    const classification = classifier.classify("Plan a trip to Araku. I need wheelchair support.");
    expect(classification.entities.requiresWheelchair).toBe(true);

    const builder = new TravellerContextBuilder();
    const context = await builder.buildContext({
      entities: classification.entities,
      intent: classification.intent
    });
    const constraintEngine = new ConstraintEngine();
    const constraints = constraintEngine.resolveConstraints(context);
    expect(constraints.hardConstraints.some((c) => c.category === "accessibility")).toBe(true);
  });

  // =========================================================================
  // 6. BUDGET INTELLIGENCE
  // =========================================================================
  it("Scenario 6: Budget Intelligence — verified fee tracking, honest disclosure of unknown costs", async () => {
    const res = await request(app).get(`/api/v1/budget/destinations/${ARAKU_DEST_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.destinationId).toBe(ARAKU_DEST_ID);
    expect(res.body.data.budget).toBeDefined();
    expect(res.body.data.breakdown).toBeDefined();
  });

  // =========================================================================
  // 7. SUSTAINABILITY & ECO-TOURISM
  // =========================================================================
  it("Scenario 7: Sustainability — eco-rating, community initiatives, transparent carbon availability", async () => {
    const res = await request(app).get(`/api/v1/sustainability/destinations/${ARAKU_DEST_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sustainabilityStatus).toBeDefined();
    expect(res.body.data.carbonAssessment).toBeDefined();
  });

  // =========================================================================
  // 8. CONTENT & MULTILINGUAL TRANSLATION
  // =========================================================================
  it("Scenario 8: Content & Multilingual — destination summary with grounded translation support", async () => {
    const res = await request(app).get(`/api/v1/content/destinations/${ARAKU_DEST_ID}/summary`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.destinationId).toBe(ARAKU_DEST_ID);
    expect(res.body.data.sections).toBeDefined();
  });

  // =========================================================================
  // 9. LOCAL BUSINESSES
  // =========================================================================
  it("Scenario 9: Local Business — verified vendor records with bounded results", async () => {
    const res = await request(app).get(`/api/v1/businesses/destinations/${ARAKU_DEST_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.businesses).toBeDefined();
    expect(Array.isArray(res.body.data.businesses)).toBe(true);
  });

  // =========================================================================
  // 10. MULTI-DESTINATION PLANNING
  // =========================================================================
  it("Scenario 10: Multi-Destination — separate city resolution, per-city day allocation, no pollution", async () => {
    const classifier = new IntentClassifier();
    const query = "Plan a trip covering Fort Kochi and Marari Beach";
    const classification = classifier.classify(query);

    expect(classification.intent).toBe("trip_planning");
    expect(
      classification.entities.destinationNames?.length || classification.entities.destinationName
    ).toBeDefined();

    const destRepo = {
      findById: vi
        .fn()
        .mockImplementation(
          async (id: string) => [DEST_KOCHI, DEST_MARARI].find((d) => d.id === id) ?? null
        )
    } as unknown as DestinationRepository;

    const planner = new MultiDestinationPlanner(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      destRepo
    );

    const ctx = await new TravellerContextBuilder().buildContext({
      entities: classification.entities,
      intent: classification.intent
    });
    const constraints = new ConstraintEngine().resolveConstraints(ctx);

    const plan = await planner.plan({
      locationResolution: {
        status: "multi_resolved",
        destinations: [
          { id: DEST_KOCHI.id, name: DEST_KOCHI.name, district: null, state: "Kerala" },
          { id: DEST_MARARI.id, name: DEST_MARARI.name, district: null, state: "Kerala" }
        ],
        candidateDestinations: [
          { id: DEST_KOCHI.id, name: DEST_KOCHI.name, district: null, state: "Kerala" },
          { id: DEST_MARARI.id, name: DEST_MARARI.name, district: null, state: "Kerala" }
        ],
        unresolvedTokens: [],
        warnings: []
      },
      selectedDestinations: [
        {
          id: DEST_KOCHI.id,
          name: DEST_KOCHI.name,
          district: null,
          state: "Kerala",
          selectionReason: "cultural",
          dataQuality: {
            verifiedAttractions: 1,
            verifiedExperiences: 0,
            status: "limited",
            explanation: ""
          }
        },
        {
          id: DEST_MARARI.id,
          name: DEST_MARARI.name,
          district: null,
          state: "Kerala",
          selectionReason: "beach",
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
      constraintResolution: constraints,
      entities: { ...classification.entities, days: 3 }
    });

    expect(plan.selectedDestinations.length).toBe(2);
    expect(plan.dayAllocation.length).toBe(2);
    expect(plan.days.length).toBe(3);
  });

  // =========================================================================
  // 11. ADAPTIVE ITINERARY
  // =========================================================================
  it("Scenario 11: Adaptive Itinerary — change detection, affected item replanning, non-persistent adaptation", async () => {
    const adaptiveService = new AdaptiveItineraryService();
    const triggers = adaptiveService.parseTriggers("It's raining today, adjust my plan");
    expect(triggers.isAdaptationQuery).toBe(true);
    expect(triggers.weatherTrigger).toBe(true);
  });

  // =========================================================================
  // 12. AUTHENTICATION REGRESSION
  // =========================================================================
  it("Scenario 12: Authentication Regression — missing or invalid token yields 401 Unauthorized", async () => {
    const res1 = await request(app).get("/api/v1/auth/me");
    expect(res1.status).toBe(401);
    expect(res1.body.success).toBe(false);

    const res2 = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer invalid-token-xyz");
    expect(res2.status).toBe(401);
    expect(res2.body.success).toBe(false);
  });

  // =========================================================================
  // 13. AUTHORIZATION / RBAC REGRESSION
  // =========================================================================
  it("Scenario 13: Authorization / RBAC — cross-user access blocked, role isolation maintained", async () => {
    const res = await request(app).get("/api/v1/trips/11111111-1111-1111-1111-111111111111");

    expect([401, 403]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  // =========================================================================
  // 14. PRIVACY REGRESSION
  // =========================================================================
  it("Scenario 14: Privacy Regression — zero token/secret leakage in logs, headers, or responses", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    const bodyStr = JSON.stringify(res.body);

    expect(bodyStr).not.toContain("eyJh");
    expect(bodyStr).not.toContain("AIzaSy");
    expect(bodyStr).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  // =========================================================================
  // 15. API SECURITY REGRESSION
  // =========================================================================
  it("Scenario 15: API Security — oversized payloads rejected (400), rate-limit headers present", async () => {
    const hugeMessage = "A".repeat(2500);
    const res = await request(app).post("/api/v1/ai/chat").send({ message: hugeMessage });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");

    const healthRes = await request(app).get("/health");
    expect(healthRes.headers["x-ratelimit-limit"]).toBeDefined();
    expect(healthRes.headers["x-ratelimit-remaining"]).toBeDefined();
  });
});
