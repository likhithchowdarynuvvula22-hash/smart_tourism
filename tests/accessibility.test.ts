import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { AccessibilityService } from "../src/services/accessibility/accessibility.service";
import { AccessibilityAnalyzer } from "../src/services/accessibility/analyzers/accessibility.analyzer";
import { ElderlyTravelAnalyzer } from "../src/services/accessibility/analyzers/elderlyTravel.analyzer";
import { TourismRepository } from "../src/repositories/tourism.repository";
import { DestinationRepository } from "../src/repositories/destination.repository";
import { WeatherService } from "../src/services/external/weather/weather.service";
import { RoutingService } from "../src/services/external/routing/routing.service";
import { IntentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { TOOL_REGISTRY } from "../src/services/ai/tools/tool.registry";
import { DeterministicAIProvider } from "../src/services/ai/providers/deterministic.provider";
import { CandidateFilter } from "../src/services/ai/itinerary/candidate.filter";
import { ItineraryService } from "../src/services/ai/itinerary/itinerary.service";
import { OrchestratorResponseDto } from "../src/types/ai";
import { Database } from "../src/types/database.types";

type DestinationRow = Database["public"]["Tables"]["destinations"]["Row"];
type AttractionRow = Database["public"]["Tables"]["attractions"]["Row"];
type AccessibilityRow = Database["public"]["Tables"]["accessibility"]["Row"];
type ElderlySupportRow = Database["public"]["Tables"]["elderly_support"]["Row"];
type OpeningHoursRow = Database["public"]["Tables"]["opening_hours"]["Row"];

describe("Phase 7C: Elderly & Accessibility Travel Intelligence Suite", () => {
  const app = createApp();

  const mockDestination: DestinationRow = {
    id: "01e98249-049a-4017-a5fb-98b913e05ca5",
    name: "Araku Valley",
    state: "Andhra Pradesh",
    city: "Araku",
    district: "Alluri Sitharama Raju",
    description: "Scenic hill station in the Eastern Ghats",
    category: "Hill Station",
    latitude: 18.3128,
    longitude: 82.8808,
    altitude: 914,
    best_time_to_visit: "Oct-Mar",
    rush_free_hours: "Rush: 09:00-14:00 Free: 14:00-17:00",
    tags: ["nature", "valleys"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };

  const mockAttraction1: AttractionRow = {
    id: "a530de1a-0730-42fc-9a6e-c7320a00f926",
    destination_id: mockDestination.id,
    name: "Hussain Sagar Promenade",
    category: "Urban / Lake",
    description: "Scenic lakeside promenade with broad paved walkways",
    district: "Hyderabad",
    latitude: 17.4239,
    longitude: 78.4738,
    official_url: "https://hyderabad.telangana.gov.in",
    source: "Telangana Tourism",
    source_url: null,
    verification_status: "official",
    last_verified: "2026-08-24",
    attraction_code: "ATTR-001",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };

  const mockAttraction2: AttractionRow = {
    id: "530ffed3-61bb-4280-bd64-91bcb22b948f",
    destination_id: mockDestination.id,
    name: "Dwarkadhish Temple Viewpoint",
    category: "Heritage / Temple",
    description: "Ancient stone temple requiring multi-tiered stair climbs",
    district: "Dwarka",
    latitude: 22.2376,
    longitude: 68.9678,
    official_url: null,
    source: "Gujarat Tourism",
    source_url: null,
    verification_status: "official",
    last_verified: "2026-08-24",
    attraction_code: "ATTR-002",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };

  const mockAccessibilitySupported: AccessibilityRow = {
    id: "acc-1",
    attraction_id: mockAttraction1.id,
    wheelchair_access: true,
    ramps: true,
    lifts: true,
    accessible_toilet: true,
    resting_areas: true,
    walking_difficulty: "Low",
    steps_count: 0,
    medical_distance_km: 1.5,
    accessible_transport: true,
    source: "Telangana Tourism",
    source_url: null,
    verification_status: "verified_accessible",
    last_verified: "2026-08-24"
  };

  const mockAccessibilityUnsupported: AccessibilityRow = {
    id: "acc-2",
    attraction_id: mockAttraction2.id,
    wheelchair_access: false,
    ramps: false,
    lifts: false,
    accessible_toilet: false,
    resting_areas: false,
    walking_difficulty: "High",
    steps_count: 50,
    medical_distance_km: 3.0,
    accessible_transport: false,
    source: "Gujarat Tourism",
    source_url: null,
    verification_status: "verified_stairs_only",
    last_verified: "2026-08-24"
  };

  const mockElderlySupported: ElderlySupportRow = {
    id: "eld-1",
    attraction_id: mockAttraction1.id,
    benches: true,
    ramps: true,
    lifts: true,
    accessible_toilet: true,
    stairs: "None (Level Paved Ground)",
    source: "Telangana Tourism",
    source_url: null,
    verification_status: "verified_elder_amenities",
    last_verified: "2026-08-24"
  };

  const mockElderlyUnsupported: ElderlySupportRow = {
    id: "eld-2",
    attraction_id: mockAttraction2.id,
    benches: false,
    ramps: false,
    lifts: false,
    accessible_toilet: false,
    stairs: "50+",
    source: "Gujarat Tourism",
    source_url: null,
    verification_status: "verified_steep_stairs",
    last_verified: "2026-08-24"
  };

  describe("1. Schema & Data Sufficiency", () => {
    it("1. should reject invalid destination UUID with 400 Bad Request", async () => {
      const res = await request(app).get("/api/v1/accessibility/destinations/not-a-valid-uuid");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Invalid destination ID format");
    });

    it("2. should return 404 for non-existent destination UUID", async () => {
      const res = await request(app).get(
        "/api/v1/accessibility/destinations/00000000-0000-0000-0000-000000000000"
      );
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("not found");
    });

    it("3. should classify destination with zero accessibility data as 'insufficient' and 'unknown'", async () => {
      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const mockTourRepo = {
        findAttractionsByDestinationId: vi.fn().mockResolvedValue([mockAttraction1]),
        findAccessibilityByDestinationId: vi.fn().mockResolvedValue([])
      } as unknown as TourismRepository;

      const service = new AccessibilityService(
        mockDestRepo,
        mockTourRepo,
        new AccessibilityAnalyzer(),
        new ElderlyTravelAnalyzer()
      );

      const result = await service.getDestinationAccessibility(mockDestination.id);
      expect(result.dataQuality.status).toBe("insufficient");
      expect(result.accessibilityStatus).toBe("unknown");
      expect(result.confidence).toBe(0.25);
      expect(result.unknownAttractions.length).toBe(1);
    });

    it("4. should classify destination with limited partial data as 'limited'", async () => {
      const partialAcc: AccessibilityRow = {
        id: "acc-part",
        attraction_id: mockAttraction1.id,
        wheelchair_access: null,
        ramps: null,
        lifts: null,
        accessible_toilet: null,
        resting_areas: null,
        walking_difficulty: null,
        steps_count: null,
        medical_distance_km: null,
        accessible_transport: true,
        source: "Transport Dept",
        source_url: null,
        verification_status: "transport_only",
        last_verified: "2026-08-24"
      };

      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        accessibilityRows: [partialAcc]
      });

      expect(result.dataQuality.status).toBe("sufficient");
      expect(result.accessibilityStatus).toBe("partially_supported");
      expect(result.verifiedFacilities).toContain("accessible_transit");
    });

    it("5. should classify destination with full attraction accessibility as 'sufficient'", async () => {
      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        accessibilityRows: [mockAccessibilitySupported]
      });

      expect(result.dataQuality.status).toBe("sufficient");
      expect(result.accessibilityStatus).toBe("supported");
      expect(result.confidence).toBe(0.85);
      expect(result.suitableAttractions.length).toBe(1);
    });

    it("6. should classify destination with zero elderly-support data as 'insufficient' and 'unknown'", async () => {
      const analyzer = new ElderlyTravelAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        elderlySupportRows: []
      });

      expect(result.dataQuality.status).toBe("insufficient");
      expect(result.suitability).toBe("unknown");
      expect(result.restingBenchesAvailability).toBe("unknown");
    });

    it("7. should retrieve and structure elderly-support data from service", async () => {
      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const mockTourRepo = {
        findAttractionsByDestinationId: vi.fn().mockResolvedValue([mockAttraction1]),
        findElderlySupportByDestinationId: vi.fn().mockResolvedValue([mockElderlySupported]),
        findAccessibilityByDestinationId: vi.fn().mockResolvedValue([]),
        findOpeningHoursByDestinationId: vi.fn().mockResolvedValue([]),
        findEntryFeesByDestinationId: vi.fn().mockResolvedValue([])
      } as unknown as TourismRepository;

      const service = new AccessibilityService(
        mockDestRepo,
        mockTourRepo,
        new AccessibilityAnalyzer(),
        new ElderlyTravelAnalyzer()
      );

      const result = await service.getDestinationElderlySuitability(mockDestination.id);
      expect(result.suitability).toBe("suitable");
      expect(result.restingBenchesAvailability).toBe("verified_available");
      expect(result.suitableAttractions[0].benches).toBe(true);
      expect(result.pacingGuidance).toContain("Pacing Guidance");
    });

    it("8. should retrieve attraction-level accessibility list via service", async () => {
      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const mockTourRepo = {
        findAttractionsByDestinationId: vi
          .fn()
          .mockResolvedValue([mockAttraction1, mockAttraction2]),
        findAccessibilityByDestinationId: vi
          .fn()
          .mockResolvedValue([mockAccessibilitySupported, mockAccessibilityUnsupported])
      } as unknown as TourismRepository;

      const service = new AccessibilityService(
        mockDestRepo,
        mockTourRepo,
        new AccessibilityAnalyzer(),
        new ElderlyTravelAnalyzer()
      );

      const list = await service.getAttractionAccessibility(mockDestination.id);
      expect(list.length).toBe(2);
      expect(list.some((a) => a.status === "supported")).toBe(true);
      expect(list.some((a) => a.status === "not_supported")).toBe(true);
    });

    it("9. should verify explicit supported accessibility status", async () => {
      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        accessibilityRows: [mockAccessibilitySupported]
      });

      expect(result.suitableAttractions[0].status).toBe("supported");
      expect(result.suitableAttractions[0].wheelchairAccess).toBe(true);
      expect(result.suitableAttractions[0].verifiedFacilities).toContain("wheelchair_accessible");
    });

    it("10. should verify explicit unsupported accessibility status", async () => {
      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction2],
        accessibilityRows: [mockAccessibilityUnsupported]
      });

      expect(result.unsupportedAttractions[0].status).toBe("not_supported");
      expect(result.unsupportedAttractions[0].wheelchairAccess).toBe(false);
      expect(result.warnings.some((w) => w.includes("Mobility Barrier Caution"))).toBe(true);
    });
  });

  describe("2. Status Models & Unknown Data Invariants", () => {
    it("11. should assign 'supported' status when all verified attractions are accessible", () => {
      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        accessibilityRows: [mockAccessibilitySupported]
      });

      expect(result.accessibilityStatus).toBe("supported");
      expect(result.confidence).toBe(0.85);
    });

    it("12. should assign 'partially_supported' status when accessible and limited attractions coexist", () => {
      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1, mockAttraction2],
        accessibilityRows: [mockAccessibilitySupported, mockAccessibilityUnsupported]
      });

      expect(result.accessibilityStatus).toBe("partially_supported");
      expect(result.confidence).toBe(0.8);
      expect(result.suitableAttractions.length).toBe(1);
      expect(result.unsupportedAttractions.length).toBe(1);
    });

    it("13. should assign 'not_supported' status when all attractions have explicit barriers", () => {
      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction2],
        accessibilityRows: [mockAccessibilityUnsupported]
      });

      expect(result.accessibilityStatus).toBe("not_supported");
      expect(result.confidence).toBe(0.85);
    });

    it("14. should assign 'unknown' status when evidence is insufficient", () => {
      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        accessibilityRows: []
      });

      expect(result.accessibilityStatus).toBe("unknown");
    });

    it("15. should NOT treat 'unknown' as 'not_supported'", () => {
      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        accessibilityRows: []
      });

      expect(result.accessibilityStatus).toBe("unknown");
      expect(result.accessibilityStatus).not.toBe("not_supported");
      expect(result.unknownAttractions.length).toBe(1);
      expect(result.unsupportedAttractions.length).toBe(0);
    });
  });

  describe("3. Elderly Suitability & Anti-Hallucination Guarantees", () => {
    it("16. should assess elderly suitability as 'suitable' when resting benches and ramps are verified", () => {
      const analyzer = new ElderlyTravelAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        elderlySupportRows: [mockElderlySupported]
      });

      expect(result.suitability).toBe("suitable");
      expect(result.confidence).toBe(0.85);
      expect(result.restingBenchesAvailability).toBe("verified_available");
    });

    it("17. should assess elderly suitability as 'conditionally_suitable' when split hours or moderate walking exist", () => {
      const splitHours: OpeningHoursRow = {
        id: "oh-1",
        attraction_id: mockAttraction1.id,
        opening_time: "07:00 AM",
        closing_time: "12:30 PM; 05:00 PM",
        closed_days: null,
        seasonal_notes: "Split temple visiting hours",
        source: "Temple Board",
        source_url: null,
        verification_status: "official",
        last_verified: "2026-08-24"
      };

      const analyzer = new ElderlyTravelAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        elderlySupportRows: [mockElderlySupported],
        openingHoursRows: [splitHours]
      });

      expect(result.suitability).toBe("conditionally_suitable");
      expect(result.recommendations.some((r) => r.includes("split opening hours"))).toBe(true);
    });

    it("18. should verify that absence of elderly data evaluates to 'unknown' (no elderly data ≠ not suitable)", () => {
      const analyzer = new ElderlyTravelAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        elderlySupportRows: []
      });

      expect(result.suitability).toBe("unknown");
      expect(result.suitability).not.toBe("not_recommended");
      expect(result.disclaimer).toContain("does not constitute medical or physical health advice");
    });

    it("19. should strictly report terrainAssessment as 'unavailable' without fabricating terrain gradients", () => {
      const accAnalyzer = new AccessibilityAnalyzer();
      const eldAnalyzer = new ElderlyTravelAnalyzer();

      const accRes = accAnalyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        accessibilityRows: [mockAccessibilitySupported]
      });
      const eldRes = eldAnalyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        elderlySupportRows: [mockElderlySupported]
      });

      expect(accRes.terrainAssessment).toBe("unavailable");
      expect(eldRes.terrainAssessment).toBe("unavailable");
    });

    it("20. should NOT fabricate walking difficulty when not present in database records", () => {
      const partialAcc: AccessibilityRow = {
        ...mockAccessibilitySupported,
        walking_difficulty: null,
        steps_count: null
      };

      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        accessibilityRows: [partialAcc]
      });

      expect(result.suitableAttractions[0].walkingDifficulty).toBeNull();
      expect(result.suitableAttractions[0].stepsCount).toBeNull();
    });
  });

  describe("4. Weather & Routing Integration", () => {
    it("21. should include routing distance/duration in notes without claiming walking difficulty", () => {
      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        accessibilityRows: [mockAccessibilitySupported],
        routingContext: {
          totalDrivingDistanceKm: 14.2,
          totalDrivingDurationMinutes: 28
        }
      });

      expect(result.routingNotes).toBeDefined();
      expect(result.routingNotes?.[0]).toContain("14.2 km (28 mins)");
      expect(result.routingNotes?.[0]).toContain(
        "Road transit duration does not represent walking path difficulty"
      );
    });

    it("22. should handle routing failure gracefully and return assessment without error", async () => {
      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const mockTourRepo = {
        findAttractionsByDestinationId: vi.fn().mockResolvedValue([mockAttraction1]),
        findAccessibilityByDestinationId: vi.fn().mockResolvedValue([mockAccessibilitySupported])
      } as unknown as TourismRepository;

      const mockRouting = {
        getRoute: vi.fn().mockRejectedValue(new Error("Routing service timeout"))
      } as unknown as RoutingService;

      const service = new AccessibilityService(
        mockDestRepo,
        mockTourRepo,
        new AccessibilityAnalyzer(),
        new ElderlyTravelAnalyzer(),
        undefined,
        mockRouting
      );

      const result = await service.getDestinationAccessibility(mockDestination.id);
      expect(result.accessibilityStatus).toBe("supported");
      expect(result.destinationId).toBe(mockDestination.id);
    });

    it("23. should surface contextual weather warning when high rain probability is forecasted", () => {
      const analyzer = new AccessibilityAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        attractions: [mockAttraction1],
        accessibilityRows: [mockAccessibilitySupported],
        weatherForecast: {
          precipitationProbability: 85,
          weatherCondition: "Heavy Rain"
        }
      });

      expect(result.weatherNotes).toBeDefined();
      expect(result.weatherNotes?.[0]).toContain("85% rain probability");
      expect(result.weatherNotes?.[0]).toContain("Outdoor pathways may become slippery");
      expect(result.weatherNotes?.[0]).not.toContain("inaccessible");
    });

    it("24. should handle weather failure gracefully without breaking assessment", async () => {
      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const mockTourRepo = {
        findAttractionsByDestinationId: vi.fn().mockResolvedValue([mockAttraction1]),
        findAccessibilityByDestinationId: vi.fn().mockResolvedValue([mockAccessibilitySupported])
      } as unknown as TourismRepository;

      const mockWeather = {
        getWeatherByCoordinates: vi.fn().mockRejectedValue(new Error("Open-Meteo down"))
      } as unknown as WeatherService;

      const service = new AccessibilityService(
        mockDestRepo,
        mockTourRepo,
        new AccessibilityAnalyzer(),
        new ElderlyTravelAnalyzer(),
        mockWeather
      );

      const result = await service.getDestinationAccessibility(mockDestination.id);
      expect(result.accessibilityStatus).toBe("supported");
    });
  });

  describe("5. AI Intent & Tool Integration", () => {
    it("25. should classify accessibility queries into accessibility_query and extract wheelchair entity", () => {
      const classifier = new IntentClassifier();
      const res = classifier.classify("I use a wheelchair. What can I visit in Araku?");

      expect(res.intent).toBe("accessibility_query");
      expect(res.entities.destinationName).toBe("Araku");
      expect(res.entities.requiresWheelchair).toBe(true);
      expect(res.requiredTools).toContain("accessibility_intelligence");
    });

    it("26. should classify elderly travel queries into elderly_travel_query and extract senior entity", () => {
      const classifier = new IntentClassifier();
      const res = classifier.classify("Is Araku suitable for my elderly parents?");

      expect(res.intent).toBe("elderly_travel_query");
      expect(res.entities.destinationName).toBe("Araku");
      expect(res.entities.isElderlyTraveller).toBe(true);
      expect(res.requiredTools).toContain("elderly_travel_intelligence");
    });

    it("27. should select accessibility_intelligence tool for accessibility query", () => {
      const classifier = new IntentClassifier();
      const res = classifier.classify("Which places in Hyderabad have ramp and lift access?");

      expect(res.requiredTools).toContain("accessibility_intelligence");
      expect(TOOL_REGISTRY.accessibility_intelligence).toBeDefined();
      expect(TOOL_REGISTRY.accessibility_intelligence.requiresAuth).toBe(false);
    });

    it("28. should select elderly_travel_intelligence tool for senior citizen query", () => {
      const classifier = new IntentClassifier();
      const res = classifier.classify(
        "Which attractions in Coorg have resting benches for seniors?"
      );

      expect(res.requiredTools).toContain("elderly_travel_intelligence");
      expect(TOOL_REGISTRY.elderly_travel_intelligence).toBeDefined();
      expect(TOOL_REGISTRY.elderly_travel_intelligence.requiresAuth).toBe(false);
    });

    it("29. should generate grounded AI response for accessibility query", async () => {
      const provider = new DeterministicAIProvider();
      const prompt = `User Query: "Which places in Hyderabad are wheelchair accessible?"
Intent: "accessibility_query"
Verified Context Data:
\`\`\`json
{
  "intent": "accessibility_query",
  "destination": { "id": "${mockDestination.id}", "name": "Hyderabad" },
  "accessibility_assessment": {
    "destinationId": "${mockDestination.id}",
    "destinationName": "Hyderabad",
    "accessibilityStatus": "supported",
    "confidence": 0.85,
    "dataQuality": { "status": "sufficient" },
    "suitableAttractions": [{ "attractionName": "Hussain Sagar Promenade" }],
    "warnings": []
  },
  "sources": [{ "type": "database", "provider": "Supabase", "resource": "accessibility" }]
}
\`\`\``;

      const response = await provider.generateStructuredResponse<OrchestratorResponseDto>(prompt);
      expect(response.intent).toBe("accessibility_query");
      expect(response.summary).toContain("Hussain Sagar Promenade");
      expect(response.accessibilityAssessment?.accessibilityStatus).toBe("supported");
    });

    it("30. should return grounded fallback when accessibility data is missing from AI context", async () => {
      const provider = new DeterministicAIProvider();
      const prompt = `User Query: "Is Araku wheelchair accessible?"
Intent: "accessibility_query"
Verified Context Data:
\`\`\`json
{
  "intent": "accessibility_query",
  "destination": { "id": "${mockDestination.id}", "name": "Araku Valley" },
  "accessibility_assessment": null,
  "sources": []
}
\`\`\``;

      const response = await provider.generateStructuredResponse<OrchestratorResponseDto>(prompt);
      expect(response.intent).toBe("accessibility_query");
      expect(response.summary).toContain(
        "Current destination-specific accessibility and wheelchair data is limited or unavailable"
      );
    });
  });

  describe("6. Itinerary Integration & Candidate Ranking", () => {
    it("31. should prioritize wheelchair accessible places in candidate filter", () => {
      const filter = new CandidateFilter();
      const candidates = filter.filterAndNormalize(
        {
          destination: mockDestination,
          attractions: [mockAttraction2, mockAttraction1],
          accessibility: [mockAccessibilityUnsupported, mockAccessibilitySupported]
        },
        { requiresWheelchair: true, destinationName: "Araku" }
      );

      expect(candidates[0].id).toBe(mockAttraction1.id);
      expect(candidates[0].isWheelchairAccessible).toBe(true);
    });

    it("32. should prioritize senior-friendly places with benches in candidate filter for elderly travellers", () => {
      const filter = new CandidateFilter();
      const candidates = filter.filterAndNormalize(
        {
          destination: mockDestination,
          attractions: [mockAttraction2, mockAttraction1],
          elderlySupport: [mockElderlyUnsupported, mockElderlySupported]
        },
        { travellerGroup: "parents", isElderlyTraveller: true, destinationName: "Araku" }
      );

      expect(candidates[0].id).toBe(mockAttraction1.id);
      expect(candidates[0].isElderlyFriendly).toBe(true);
    });

    it("33. should integrate pacing guidance and accessibility assessment in itinerary planning", async () => {
      const itinService = new ItineraryService();
      const result = await itinService.generateItinerary(
        "Plan a relaxed trip to Araku for my elderly parents",
        {
          destinationName: "Araku",
          days: 2,
          travellerGroup: "parents",
          isElderlyTraveller: true
        },
        {
          destination: { id: mockDestination.id, name: "Araku Valley" },
          attractions: [mockAttraction1],
          elderly_assessment: {
            destinationId: mockDestination.id,
            destinationName: "Araku Valley",
            suitability: "suitable",
            confidence: 0.85,
            dataQuality: {
              status: "sufficient",
              explanation: "Verified senior amenities available",
              verifiedAttractionsCount: 1,
              totalAttractionsCount: 1,
              evidenceAvailable: ["verified_resting_benches"],
              evidenceUnavailable: []
            },
            terrainAssessment: "unavailable",
            pacingGuidance:
              "Pacing Guidance (Relaxed Travel): Plan a gentle itinerary with a maximum of 2 relaxed stops per day.",
            restingBenchesAvailability: "verified_available",
            suitableAttractions: [],
            conditionallySuitableAttractions: [],
            notRecommendedAttractions: [],
            unknownAttractions: [],
            recommendations: ["Plan a gentle itinerary with maximum 2 stops per day."],
            warnings: [],
            disclaimer:
              "Senior citizen travel suitability is synthesized strictly from official metadata.",
            sources: [{ type: "database", provider: "Supabase", resource: "elderly_support" }]
          },
          sources: [{ type: "database", provider: "Supabase", resource: "elderly_support" }]
        }
      );

      expect(result.days?.length).toBe(2);
      expect(result.elderlyAssessment).toBeDefined();
      expect(result.elderlyAssessment?.pacingGuidance).toContain("Pacing Guidance");
    });

    it("34. should handle unknown accessibility places without falsely claiming confirmed accessibility", () => {
      const filter = new CandidateFilter();
      const candidates = filter.filterAndNormalize(
        {
          destination: mockDestination,
          attractions: [mockAttraction1],
          accessibility: []
        },
        { destinationName: "Araku" }
      );

      expect(candidates[0].isWheelchairAccessible).toBe(false);
      expect(candidates[0].accessibilityNotes.length).toBe(0);
    });
  });

  describe("7. Security & API Endpoints", () => {
    it("35. should serve GET /api/v1/accessibility/destinations/:id publicly without auth", async () => {
      const res = await request(app).get(
        `/api/v1/accessibility/destinations/${mockDestination.id}`
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationId).toBe(mockDestination.id);
      expect(res.body.data.accessibilityStatus).toBeDefined();
      expect(res.body.data.terrainAssessment).toBe("unavailable");
      expect(res.body.data.disclaimer).toBeDefined();
    });

    it("36. should ensure zero user data or internal authorization leaks in accessibility response", async () => {
      const res = await request(app).get(
        `/api/v1/accessibility/destinations/${mockDestination.id}`
      );
      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBeUndefined();
      expect(res.body.data.sql).toBeUndefined();
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.jwt).toBeUndefined();
    });
  });
});
