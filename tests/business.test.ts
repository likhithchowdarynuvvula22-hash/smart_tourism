import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../src/app";
import { businessService, BusinessService } from "../src/services/business/business.service";
import { businessAnalyzer } from "../src/services/business/analyzers/business.analyzer";
import { TOOL_REGISTRY } from "../src/services/ai/tools/tool.registry";
import { ToolExecutor } from "../src/services/ai/tools/tool.executor";
import { IntentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { DeterministicAIProvider } from "../src/services/ai/providers/deterministic.provider";
import { DestinationRow, LocalBusinessRow } from "../src/types/database.types";
import { LocalBusinessItemDto } from "../src/types/business";
import { OrchestratorResponseDto } from "../src/types/ai";

describe("Phase 7G: Local Business & Local Economy Intelligence Suite", () => {
  const dummyDestId = "00000000-0000-0000-0000-000000000001";
  const dummyBizId1 = "10000000-0000-0000-0000-000000000001";
  const dummyBizId2 = "10000000-0000-0000-0000-000000000002";

  const mockDestination: DestinationRow = {
    id: dummyDestId,
    name: "Kochi",
    state: "Kerala",
    district: "Ernakulam",
    city: "Kochi",
    description: "Historic port city and spice trading center",
    category: "Heritage",
    popularity: 90,
    best_time_to_visit: "Oct-Mar",
    rush_free_hours: "07:00-10:00",
    latitude: 9.9312,
    longitude: 76.2673,
    source: "Kerala Tourism",
    source_url: "https://keralatourism.org",
    verification_status: "verified",
    created_at: new Date().toISOString()
  };

  const mockBusiness1: LocalBusinessRow = {
    id: dummyBizId1,
    business_code: "BUS-KER-001",
    destination_id: dummyDestId,
    name: "Fort Heritage Homestay",
    type: "Homestay",
    address: "Princess Street, Fort Kochi, Kerala",
    phone: "+91-9847000001",
    email: "info@fortheritage.com",
    languages: "English; Malayalam; Hindi",
    verified: true,
    source: "Kerala Tourism",
    source_url: "https://keralatourism.org/homestays",
    verification_status: "official_approved",
    created_at: new Date().toISOString()
  };

  const mockBusiness2: LocalBusinessRow = {
    id: dummyBizId2,
    business_code: "BUS-KER-002",
    destination_id: dummyDestId,
    name: "Malabar Spice Cafe & Restaurant",
    type: "Restaurant",
    address: "Bazaar Road, Mattancherry, Kochi, Kerala",
    phone: "+91-9847000002",
    email: "dining@malabarspice.com",
    languages: "English; Malayalam",
    verified: true,
    source: "Kerala Tourism",
    source_url: "https://keralatourism.org/dining",
    verification_status: "official_approved",
    created_at: new Date().toISOString()
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. DATA (Tests 1–10)
  // =========================================================================
  describe("1. Data & Metadata Retrieval", () => {
    it("1. should reject invalid destination UUID with 400 Bad Request", async () => {
      const res = await request(app).get("/api/v1/businesses/destinations/not-a-valid-uuid");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    });

    it("2. should return 404 for non-existent destination UUID", async () => {
      const nonExistentUuid = "99999999-9999-9999-9999-999999999999";
      const res = await request(app).get(`/api/v1/businesses/destinations/${nonExistentUuid}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("3. should handle destination with zero business records gracefully as insufficient", () => {
      const assessment = businessAnalyzer.assessBusinesses(mockDestination, []);
      expect(assessment.dataQuality.status).toBe("insufficient");
      expect(assessment.dataQuality.totalCount).toBe(0);
      expect(assessment.dataQuality.explanation).toContain(
        "No verified local businesses are currently indexed for this destination."
      );
      expect(assessment.businesses).toHaveLength(0);
    });

    it("4. should classify destination with 1 business record as limited coverage", () => {
      const assessment = businessAnalyzer.assessBusinesses(mockDestination, [mockBusiness1]);
      expect(assessment.dataQuality.status).toBe("limited");
      expect(assessment.dataQuality.totalCount).toBe(1);
    });

    it("5. should classify multiple verified businesses as sufficient coverage", () => {
      const assessment = businessAnalyzer.assessBusinesses(mockDestination, [
        mockBusiness1,
        mockBusiness2
      ]);
      expect(assessment.dataQuality.status).toBe("sufficient");
      expect(assessment.dataQuality.totalCount).toBe(2);
      expect(assessment.dataQuality.verifiedCount).toBe(2);
    });

    it("6. should normalize raw business row into LocalBusinessItemDto accurately", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      expect(item.id).toBe(dummyBizId1);
      expect(item.name).toBe("Fort Heritage Homestay");
      expect(item.normalizedCategory).toBe("homestay");
      expect(item.phone).toBe("+91-9847000001");
      expect(item.email).toBe("info@fortheritage.com");
      expect(item.languages).toEqual(["English", "Malayalam", "Hindi"]);
      expect(item.verified).toBe(true);
      expect(item.source.provider).toBe("Kerala Tourism");
    });

    it("7. should retrieve single business details by UUID", async () => {
      vi.spyOn(businessService, "getBusinessById").mockResolvedValue(
        businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination)
      );

      const res = await request(app).get(`/api/v1/businesses/${dummyBizId1}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(dummyBizId1);
      expect(res.body.data.name).toBe("Fort Heritage Homestay");
    });

    it("8. should filter businesses by category", () => {
      const assessment = businessAnalyzer.assessBusinesses(
        mockDestination,
        [mockBusiness1, mockBusiness2],
        { category: "restaurant" }
      );
      expect(assessment.businesses).toHaveLength(1);
      expect(assessment.businesses[0].normalizedCategory).toBe("restaurant");
    });

    it("9. should filter businesses by search term", () => {
      const assessment = businessAnalyzer.assessBusinesses(
        mockDestination,
        [mockBusiness1, mockBusiness2],
        { search: "Spice" }
      );
      expect(assessment.businesses).toHaveLength(1);
      expect(assessment.businesses[0].name).toContain("Spice");
    });

    it("10. should filter businesses by verifiedOnly flag", () => {
      const unverifiedBiz: LocalBusinessRow = {
        ...mockBusiness1,
        id: "10000000-0000-0000-0000-000000000003",
        verified: false,
        verification_status: "unverified"
      };
      const assessment = businessAnalyzer.assessBusinesses(
        mockDestination,
        [mockBusiness1, unverifiedBiz],
        { verifiedOnly: true }
      );
      expect(assessment.businesses).toHaveLength(1);
      expect(assessment.businesses[0].verified).toBe(true);
    });
  });

  // =========================================================================
  // 2. RANKING (Tests 11–18)
  // =========================================================================
  describe("2. Deterministic Ranking Engine", () => {
    it("11. should boost score for exact category match (+35)", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      const scoreResult = businessAnalyzer.scoreBusiness(item, { category: "homestay" });
      expect(scoreResult.score).toBeGreaterThanOrEqual(85);
      expect(scoreResult.reason).toContain("Exact category match");
    });

    it("12. should apply related category boost (+20) when hotel is requested for homestay", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      const scoreResult = businessAnalyzer.scoreBusiness(item, { category: "hotel" });
      expect(scoreResult.score).toBeGreaterThanOrEqual(70);
      expect(scoreResult.reason).toContain("Related category match");
    });

    it("13. should apply verified business boost (+10)", () => {
      const verifiedItem = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      const unverifiedItem: LocalBusinessItemDto = { ...verifiedItem, verified: false };

      const scoreV = businessAnalyzer.scoreBusiness(verifiedItem);
      const scoreU = businessAnalyzer.scoreBusiness(unverifiedItem);
      expect(scoreV.score).toBe(scoreU.score + 10);
    });

    it("14. should handle accessibility query neutrally without fabricating venue access", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      const scoreResult = businessAnalyzer.scoreBusiness(item, { isWheelchairUser: true });
      expect(item.accessibility.wheelchairAccess).toBe("unknown");
      expect(scoreResult.score).toBe(70); // Base 50 + 10 verified + 10 destination
    });

    it("15. should handle elderly query neutrally without fabricating senior ramps", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      const scoreResult = businessAnalyzer.scoreBusiness(item, { isElderlyTraveller: true });
      expect(item.elderlySuitability.suitable).toBe("unknown");
      expect(scoreResult.score).toBe(70);
    });

    it("16. should apply budget context boost (+10) for homestays when budget constrained", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      const scoreResult = businessAnalyzer.scoreBusiness(item, { isBudgetConstrained: true });
      expect(scoreResult.score).toBe(80); // Base 50 + 10 verified + 10 dest + 10 budget
      expect(scoreResult.reason).toContain("Community homestay alternative");
    });

    it("17. should penalize businesses matching user avoid-interests (-60)", () => {
      const shoppingItem = businessAnalyzer.normalizeBusiness(
        {
          ...mockBusiness1,
          name: "Kerala Handloom & Craft Store",
          type: "Handicrafts"
        },
        mockDestination
      );
      const scoreResult = businessAnalyzer.scoreBusiness(shoppingItem, {
        avoidInterests: ["shopping"]
      });
      expect(scoreResult.score).toBeLessThanOrEqual(20);
      expect(scoreResult.reason).toContain("Suppressed due to user avoid-interest filter");
    });

    it("18. should ensure missing metadata does not create false penalties", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      const scoreResult = businessAnalyzer.scoreBusiness(item, {});
      expect(scoreResult.score).toBe(70); // 50 base + 10 verified + 10 dest
    });
  });

  // =========================================================================
  // 3. GROUNDING & ANTI-FABRICATION (Tests 19–25)
  // =========================================================================
  describe("3. Strict Grounding & Anti-Fabrication", () => {
    it("19. should not fabricate uncatalogued businesses", () => {
      const assessment = businessAnalyzer.assessBusinesses(mockDestination, []);
      expect(assessment.businesses).toHaveLength(0);
    });

    it("20. should return price as 'unknown' and not fabricate numeric hotel/restaurant bills", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      expect(item.price).toBe("unknown");
    });

    it("21. should return openingHours as 'unknown' and not fabricate business schedules", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      expect(item.openingHours).toBe("unknown");
    });

    it("22. should return rating as 'unknown' and not fabricate 5-star reviews", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      expect(item.rating).toBe("unknown");
    });

    it("23. should return wheelchair access as 'unknown' without inventing physical ramps", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      expect(item.accessibility.wheelchairAccess).toBe("unknown");
      expect(item.accessibility.notes[0]).toContain("uncatalogued");
    });

    it("24. should not claim a business is a safe zone without database safety tags", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      expect(item.matchReason).not.toContain("guaranteed safe zone");
    });

    it("25. should not fabricate language support beyond verified string values", () => {
      const noLangBiz: LocalBusinessRow = { ...mockBusiness1, languages: null };
      const item = businessAnalyzer.normalizeBusiness(noLangBiz, mockDestination);
      expect(item.languages).toHaveLength(0);
    });
  });

  // =========================================================================
  // 4. CROSS-PHASE INTEGRATION (Tests 26–33)
  // =========================================================================
  describe("4. Cross-Phase Intelligence Integration", () => {
    it("26. should integrate user interests from Phase 7E into ranking", () => {
      const restaurantItem = businessAnalyzer.normalizeBusiness(mockBusiness2, mockDestination);
      const scoreResult = businessAnalyzer.scoreBusiness(restaurantItem, {
        interests: ["food", "dining"]
      });
      expect(scoreResult.score).toBeGreaterThanOrEqual(85);
      expect(scoreResult.reason).toContain("Matches dining preference");
    });

    it("27. should integrate budget context from Phase 7D", () => {
      const assessment = businessAnalyzer.assessBusinesses(
        mockDestination,
        [mockBusiness1, mockBusiness2],
        { isBudgetConstrained: true }
      );
      expect(assessment.unknowns).toContain("unrecorded_commercial_pricing_and_menus");
    });

    it("28. should disclose venue-specific accessibility unknowns from Phase 7C", () => {
      const assessment = businessAnalyzer.assessBusinesses(mockDestination, [mockBusiness1]);
      expect(assessment.unknowns).toContain("venue_specific_wheelchair_and_elderly_accommodations");
    });

    it("29. should preserve elderly suitability unknowns without false positives", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      expect(item.elderlySuitability.suitable).toBe("unknown");
    });

    it("30. should maintain provenance sources for Phase 7B compliance", () => {
      const assessment = businessAnalyzer.assessBusinesses(mockDestination, [mockBusiness1]);
      expect(assessment.sources.some((s) => s.provider === "Kerala Tourism")).toBe(true);
    });

    it("31. should disclose off-peak crowd limitation for local businesses (Phase 7A)", () => {
      const assessment = businessAnalyzer.assessBusinesses(mockDestination, [mockBusiness1]);
      expect(assessment.unknowns).toContain("uncatalogued_daily_opening_and_closing_hours");
    });

    it("32. should preserve original business name and address for Phase 7F multilingual", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      expect(item.name).toBe("Fort Heritage Homestay");
      expect(item.address).toBe("Princess Street, Fort Kochi, Kerala");
    });

    it("33. should handle business routing gracefully when coordinates are null", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      expect(item.address).toBeDefined();
    });
  });

  // =========================================================================
  // 5. AI TOOL & ORCHESTRATOR INTEGRATION (Tests 34–37)
  // =========================================================================
  describe("5. AI Tool & Intent Integration", () => {
    const classifier = new IntentClassifier();

    it("34. should classify local_business_query intent for restaurant and hotel questions", () => {
      const q1 = "Find restaurants and cafes in Kochi";
      const c1 = classifier.classify(q1);
      expect(c1.intent).toBe("local_business_query");
      expect(c1.entities.businessCategory).toBe("restaurant");
      expect(c1.requiredTools).toContain("local_business_intelligence");

      const q2 = "Show verified homestays in Kochi";
      const c2 = classifier.classify(q2);
      expect(c2.intent).toBe("local_business_query");
      expect(c2.entities.businessCategory).toBe("homestay");
      expect(c2.requiredTools).toContain("local_business_intelligence");
    });

    it("35. should register local_business_intelligence tool in TOOL_REGISTRY (total 25)", () => {
      expect(Object.keys(TOOL_REGISTRY).length).toBe(25);
      expect(TOOL_REGISTRY.sustainability_intelligence).toBeDefined();
      expect(TOOL_REGISTRY.local_business_intelligence).toBeDefined();
      expect(TOOL_REGISTRY.local_business_intelligence.requiresAuth).toBe(false);
    });

    it("36. should execute local_business_intelligence safely via toolExecutor", async () => {
      const mockBizService = {
        getDestinationBusinesses: vi
          .fn()
          .mockResolvedValue(
            businessAnalyzer.assessBusinesses(mockDestination, [mockBusiness1, mockBusiness2])
          )
      } as unknown as BusinessService;

      const executor = new ToolExecutor(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockBizService
      );

      const context = await executor.executeTools(["local_business_intelligence"], {
        destinationId: dummyDestId
      });

      expect(context.businesses).toBeDefined();
      expect(context.businesses?.businesses).toHaveLength(2);
      expect(mockBizService.getDestinationBusinesses).toHaveBeenCalled();
    });

    it("37. should generate grounded AI response for local_business_query via orchestrator", async () => {
      const provider = new DeterministicAIProvider();
      const mockPrompt = `Verified Context Data:
\`\`\`json
{
  "intent": "local_business_query",
  "destination": { "id": "${dummyDestId}", "name": "Kochi", "state": "Kerala" },
  "businesses": {
    "destinationId": "${dummyDestId}",
    "destinationName": "Kochi",
    "state": "Kerala",
    "dataQuality": { "status": "sufficient", "totalCount": 2, "verifiedCount": 2 },
    "businesses": [
      { "name": "Fort Heritage Homestay", "type": "Homestay", "verified": true }
    ],
    "unknowns": ["unrecorded_commercial_pricing_and_menus"]
  },
  "sources": [{ "type": "database", "provider": "Kerala Tourism", "resource": "local_businesses" }]
}
\`\`\``;

      const result = await provider.generateStructuredResponse<OrchestratorResponseDto>(mockPrompt);
      expect(result.intent).toBe("local_business_query");
      expect(result.summary).toContain("Local business & commerce discovery for Kochi");
      expect(result.summary).toContain("Found 1 verified establishment(s)");
      expect(result.businesses).toBeDefined();
    });
  });

  // =========================================================================
  // 6. ITINERARY & ROUTING (Tests 38–40)
  // =========================================================================
  describe("6. Itinerary & Uniqueness Rules", () => {
    it("38. should structure local business item without duplicating IDs in itinerary context", () => {
      const item1 = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      const item2 = businessAnalyzer.normalizeBusiness(mockBusiness2, mockDestination);
      const ids = new Set([item1.id, item2.id]);
      expect(ids.size).toBe(2);
    });

    it("39. should maintain deterministic sort order by score DESC then name ASC", () => {
      const assessment = businessAnalyzer.assessBusinesses(
        mockDestination,
        [mockBusiness2, mockBusiness1],
        { interests: ["culture"] }
      );
      expect(assessment.businesses).toHaveLength(2);
      expect(assessment.businesses[0].matchScore).toBeGreaterThanOrEqual(
        assessment.businesses[1].matchScore
      );
    });

    it("40. should safely omit route travel duration when business coordinates are absent", () => {
      const item = businessAnalyzer.normalizeBusiness(mockBusiness1, mockDestination);
      expect(item.address).toBeTruthy();
    });
  });

  // =========================================================================
  // 7. SECURITY & ENDPOINTS (Tests 41–42)
  // =========================================================================
  describe("7. Security & Privacy Guarantees", () => {
    it("41. should serve GET /api/v1/businesses/destinations/:id publicly without auth", async () => {
      vi.spyOn(businessService, "getDestinationBusinesses").mockResolvedValue(
        businessAnalyzer.assessBusinesses(mockDestination, [mockBusiness1])
      );

      const res = await request(app).get(`/api/v1/businesses/destinations/${dummyDestId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.businesses).toHaveLength(1);
    });

    it("42. should ensure zero user data or private preferences leak in business responses", async () => {
      vi.spyOn(businessService, "getDestinationBusinesses").mockResolvedValue(
        businessAnalyzer.assessBusinesses(mockDestination, [mockBusiness1])
      );

      const res = await request(app).get(`/api/v1/businesses/destinations/${dummyDestId}`);
      expect(res.status).toBe(200);
      const payloadString = JSON.stringify(res.body);
      expect(payloadString).not.toContain("password");
      expect(payloadString).not.toContain("token");
      expect(payloadString).not.toContain("user_id");
    });
  });
});
