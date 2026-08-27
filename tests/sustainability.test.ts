import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../src/app";
import { SustainabilityAnalyzer } from "../src/services/sustainability/analyzers/sustainability.analyzer";
import { TOOL_REGISTRY } from "../src/services/ai/tools/tool.registry";
import { IntentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { DeterministicAIProvider } from "../src/services/ai/providers/deterministic.provider";
import {
  DestinationRow,
  ExperienceRow,
  AttractionRow,
  LocalBusinessRow
} from "../src/types/database.types";
import { DestinationSustainabilityDto } from "../src/types/sustainability";
import { OrchestratorResponseDto } from "../src/types/ai";

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const DEST_ID = "00000000-0000-0000-0000-000000000099";
const ATTR_ID_1 = "aaaaaaaa-0000-0000-0000-000000000001";
const EXP_ID_1 = "eeeeeeee-0000-0000-0000-000000000001";
const EXP_ID_2 = "eeeeeeee-0000-0000-0000-000000000002";
const BIZ_ID_1 = "bbbbbbbb-0000-0000-0000-000000000001";

const mockAraku: DestinationRow = {
  id: "01e98249-049a-4017-a5fb-98b913e05ca5",
  name: "Araku Valley",
  state: "Andhra Pradesh",
  district: "Alluri Sitharama Raju",
  city: null,
  description: null,
  category: null,
  popularity: 70,
  best_time_to_visit: "Oct-Mar",
  rush_free_hours: "Rush: 09:00-14:00 Free: 14:00-17:00",
  latitude: 18.33,
  longitude: 82.88,
  source: "India State-wise Tourist Destinations",
  source_url: null,
  verification_status: "source_document",
  created_at: new Date().toISOString()
};

const mockEcoExperience: ExperienceRow = {
  id: EXP_ID_1,
  experience_code: "EXP-001",
  destination_id: DEST_ID,
  name: "Eco-Wellness Experience at Yuksom Cluster",
  category: "Government tourism development project",
  provider_id: null,
  price: null,
  currency: "INR",
  duration: null,
  availability: null,
  languages: null,
  accessibility: null,
  verified: true,
  source: "Ministry of Tourism India",
  source_url: null,
  verification_status: "source_document",
  created_at: new Date().toISOString()
};

const mockCommunityExperience: ExperienceRow = {
  id: EXP_ID_2,
  experience_code: "EXP-002",
  destination_id: DEST_ID,
  name: "Tribal Cultural Experience at Midway Retreat",
  category: "Government tourism development project",
  provider_id: null,
  price: null,
  currency: "INR",
  duration: null,
  availability: null,
  languages: null,
  accessibility: null,
  verified: true,
  source: "Ministry of Tourism India",
  source_url: null,
  verification_status: "source_document",
  created_at: new Date().toISOString()
};

const mockNatureAttraction: AttractionRow = {
  id: ATTR_ID_1,
  attraction_code: "ATTR-001",
  destination_id: DEST_ID,
  name: "Ankasamudra Bird Reserve",
  district: "West Sikkim",
  category: "Wildlife / Natural",
  description: null,
  latitude: 27.38,
  longitude: 88.23,
  official_url: null,
  source: "India Tourism Attractions",
  source_url: null,
  verification_status: "source_document",
  last_verified: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const mockCommunityBusiness: LocalBusinessRow = {
  id: BIZ_ID_1,
  business_code: "BIZ-001",
  destination_id: DEST_ID,
  name: "Green Valley Homestay",
  type: "Homestay",
  address: "Yuksom Village, West Sikkim",
  phone: "+91-9876543210",
  email: null,
  languages: "Nepali; English",
  verified: true,
  source: "Kerala Tourism",
  source_url: null,
  verification_status: "official_approved",
  created_at: new Date().toISOString()
};

// ---------------------------------------------------------------------------
// Phase 7H Test Suite
// ---------------------------------------------------------------------------

describe("Phase 7H: Sustainability, Eco-Tourism & Carbon Intelligence Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. TOOL REGISTRY (Test 1)
  // ==========================================================================
  describe("1. Tool Registry", () => {
    it("1. sustainability_intelligence is registered as tool #25", () => {
      const keys = Object.keys(TOOL_REGISTRY);
      expect(keys).toContain("sustainability_intelligence");
      expect(keys.length).toBe(25);
      expect(TOOL_REGISTRY.sustainability_intelligence.category).toBe("tourism");
      expect(TOOL_REGISTRY.sustainability_intelligence.requiresAuth).toBe(false);
    });
  });

  // ==========================================================================
  // 2. INTENT CLASSIFIER (Tests 2–8)
  // ==========================================================================
  describe("2. Intent Classifier — Sustainability Intent Detection", () => {
    const classifier = new IntentClassifier();

    it("2. classifies 'eco-friendly trip' as sustainability_query", () => {
      const result = classifier.classify("Plan an eco-friendly trip to Sikkim");
      expect(result.intent).toBe("sustainability_query");
    });

    it("3. classifies 'sustainable travel' as sustainability_query", () => {
      const result = classifier.classify("What are sustainable travel options in Kerala?");
      expect(result.intent).toBe("sustainability_query");
    });

    it("4. classifies 'eco tourism' as sustainability_query", () => {
      const result = classifier.classify("Show me eco tourism options at Araku Valley");
      expect(result.intent).toBe("sustainability_query");
    });

    it("5. classifies 'carbon footprint' query as sustainability_query", () => {
      const result = classifier.classify("What is the carbon footprint of visiting Hampi?");
      expect(result.intent).toBe("sustainability_query");
    });

    it("6. classifies 'community tourism' as sustainability_query with communityPreference", () => {
      const result = classifier.classify("I prefer community tourism experiences");
      expect(result.intent).toBe("sustainability_query");
      expect(result.entities.communityPreference).toBe(true);
    });

    it("7. sets ecoFriendlyPreference entity for eco queries", () => {
      const result = classifier.classify("What eco-friendly options are available in Coorg?");
      expect(result.entities.ecoFriendlyPreference).toBe(true);
    });

    it("8. routes sustainability_query to sustainability_intelligence tool", () => {
      const result = classifier.classify("Show me sustainable destinations in India");
      expect(result.intent).toBe("sustainability_query");
      expect(result.requiredTools).toContain("sustainability_intelligence");
    });
  });

  // ==========================================================================
  // 3. SUSTAINABILITY ANALYZER — Eco Experiences (Tests 9–13)
  // ==========================================================================
  describe("3. Analyzer — Eco/Community Experience Detection", () => {
    const analyzer = new SustainabilityAnalyzer();

    it("9. detects eco_experience from 'Eco-Wellness Experience' name", () => {
      const results = analyzer.detectEcoExperiences([mockEcoExperience]);
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe("eco_experience");
      expect(results[0].entityName).toBe("Eco-Wellness Experience at Yuksom Cluster");
    });

    it("10. detects community_experience from 'Tribal Cultural Experience' name", () => {
      const results = analyzer.detectEcoExperiences([mockCommunityExperience]);
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe("community_experience");
    });

    it("11. returns empty array for non-eco experience names", () => {
      const plain: ExperienceRow = {
        ...mockEcoExperience,
        id: "other",
        name: "Temple Heritage Walk"
      };
      const results = analyzer.detectEcoExperiences([plain]);
      expect(results).toHaveLength(0);
    });

    it("12. each eco experience carries a non-eco-certification disclaimer", () => {
      const results = analyzer.detectEcoExperiences([mockEcoExperience]);
      expect(results[0].disclaimer).toContain("NOT a verified eco-certification");
    });

    it("13. detects multiple eco/community experiences in one call", () => {
      const results = analyzer.detectEcoExperiences([mockEcoExperience, mockCommunityExperience]);
      expect(results).toHaveLength(2);
    });
  });

  // ==========================================================================
  // 4. SUSTAINABILITY ANALYZER — Nature Attractions (Tests 14–16)
  // ==========================================================================
  describe("4. Analyzer — Nature Attraction Detection", () => {
    const analyzer = new SustainabilityAnalyzer();

    it("14. detects nature_attraction from 'Wildlife / Natural' category", () => {
      const results = analyzer.detectNatureAttractions([mockNatureAttraction]);
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe("nature_attraction");
    });

    it("15. does NOT flag non-nature attraction categories", () => {
      const heritage: AttractionRow = {
        ...mockNatureAttraction,
        id: "other",
        category: "Historic / Heritage"
      };
      const results = analyzer.detectNatureAttractions([heritage]);
      expect(results).toHaveLength(0);
    });

    it("16. each nature attraction carries a non-eco-certification disclaimer", () => {
      const results = analyzer.detectNatureAttractions([mockNatureAttraction]);
      expect(results[0].disclaimer).toContain("NOT a protected-area certification");
    });
  });

  // ==========================================================================
  // 5. SUSTAINABILITY ANALYZER — Community Accommodation (Tests 17–18)
  // ==========================================================================
  describe("5. Analyzer — Community Accommodation Detection", () => {
    const analyzer = new SustainabilityAnalyzer();

    it("17. detects community_accommodation from verified Homestay business", () => {
      const results = analyzer.detectCommunityAccommodation([mockCommunityBusiness]);
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe("community_accommodation");
    });

    it("18. unverified businesses are not flagged as community accommodation", () => {
      const unverified: LocalBusinessRow = { ...mockCommunityBusiness, verified: false };
      const results = analyzer.detectCommunityAccommodation([unverified]);
      expect(results).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 6. CARBON ASSESSMENT (Test 19)
  // ==========================================================================
  describe("6. Carbon Assessment", () => {
    const analyzer = new SustainabilityAnalyzer();

    it("19. carbon assessment is always 'unavailable' with explanation", () => {
      const assessment = analyzer.buildCarbonAssessment();
      expect(assessment.status).toBe("unavailable");
      expect(assessment.value).toBeNull();
      expect(assessment.unit).toBeNull();
      expect(assessment.methodology).toBeNull();
      expect(assessment.explanation).toContain("not available");
    });
  });

  // ==========================================================================
  // 7. TRANSPORT CONTEXT (Tests 20–21)
  // ==========================================================================
  describe("7. Transport Context", () => {
    const analyzer = new SustainabilityAnalyzer();

    it("20. builds railway note when station is within 30 km", () => {
      const ctx = analyzer.buildTransportContext(DEST_ID, {
        nearest_railway: "Hospet Junction (HPT)",
        railway_distance_km: 13,
        nearest_airport: null,
        airport_distance_km: null,
        highway_access: "Good road access",
        source: "Incredible India",
        source_url: null,
        verification_status: "official"
      });
      expect(ctx).not.toBeNull();
      expect(ctx!.railwayNote).toContain("13 km");
      expect(ctx!.railwayNote).toContain("general knowledge");
    });

    it("21. does NOT generate railway note when station is >30 km away", () => {
      const ctx = analyzer.buildTransportContext(DEST_ID, {
        nearest_railway: "Far Station",
        railway_distance_km: 216,
        nearest_airport: null,
        airport_distance_km: null,
        highway_access: "Road",
        source: "Official",
        source_url: null,
        verification_status: "official"
      });
      expect(ctx!.railwayNote).toBeNull();
    });
  });

  // ==========================================================================
  // 8. FULL ASSESS — Status Determination (Tests 22–25)
  // ==========================================================================
  describe("8. Full Assessment — Status Determination", () => {
    const analyzer = new SustainabilityAnalyzer();

    it("22. destinations with eco experiences yield sustainabilityStatus='favorable'", () => {
      const result = analyzer.assess(
        { id: DEST_ID, name: "Yuksom", state: "Sikkim", rush_free_hours: null },
        [mockEcoExperience, mockCommunityExperience],
        [],
        [],
        [],
        null
      );
      expect(result.sustainabilityStatus).toBe("favorable");
    });

    it("23. destinations with only 1 eco signal yield sustainabilityStatus='mixed'", () => {
      const result = analyzer.assess(
        { id: DEST_ID, name: "Yuksom", state: "Sikkim", rush_free_hours: null },
        [mockEcoExperience],
        [],
        [],
        [],
        null
      );
      expect(result.sustainabilityStatus).toBe("mixed");
    });

    it("24. destinations with zero eco signals yield sustainabilityStatus='unknown'", () => {
      const result = analyzer.assess(
        { id: DEST_ID, name: "Araku Valley", state: "Andhra Pradesh", rush_free_hours: null },
        [],
        [],
        [],
        [],
        null
      );
      expect(result.sustainabilityStatus).toBe("unknown");
    });

    it("25. 'unfavorable' status is NEVER returned", () => {
      const result = analyzer.assess(
        { id: DEST_ID, name: "Araku", state: "Andhra Pradesh", rush_free_hours: null },
        [],
        [],
        [],
        [],
        null
      );
      expect(result.sustainabilityStatus).not.toBe("unfavorable");
    });
  });

  // ==========================================================================
  // 9. DATA QUALITY (Tests 26–27)
  // ==========================================================================
  describe("9. Data Quality Classification", () => {
    const analyzer = new SustainabilityAnalyzer();

    it("26. yields 'sufficient' quality with ≥1 eco experience", () => {
      const result = analyzer.assess(
        { id: DEST_ID, name: "Yuksom", state: "Sikkim", rush_free_hours: null },
        [mockEcoExperience],
        [],
        [],
        [],
        null
      );
      expect(result.dataQuality.status).toBe("sufficient");
    });

    it("27. yields 'insufficient' quality for Araku with zero eco evidence", () => {
      const result = analyzer.assess(
        { id: DEST_ID, name: "Araku Valley", state: "Andhra Pradesh", rush_free_hours: null },
        [],
        [],
        [],
        [],
        null
      );
      expect(result.dataQuality.status).toBe("insufficient");
      expect(result.dataQuality.explanation).toContain(
        "does NOT mean the destination is unsustainable"
      );
    });
  });

  // ==========================================================================
  // 10. CONFIDENCE SCORE (Test 28)
  // ==========================================================================
  describe("10. Confidence Score", () => {
    const analyzer = new SustainabilityAnalyzer();

    it("28. confidence is null when fewer than 2 signals exist", () => {
      const result = analyzer.assess(
        { id: DEST_ID, name: "Test", state: "Test", rush_free_hours: null },
        [mockEcoExperience],
        [],
        [],
        [],
        null
      );
      expect(result.confidence).toBeNull();
    });
  });

  // ==========================================================================
  // 11. DISCLAIMER (Test 29)
  // ==========================================================================
  describe("11. Disclaimer & Unknowns", () => {
    const analyzer = new SustainabilityAnalyzer();

    it("29. assessment always includes disclaimer and unknowns list", () => {
      const result = analyzer.assess(
        { id: DEST_ID, name: "Yuksom", state: "Sikkim", rush_free_hours: null },
        [mockEcoExperience],
        [],
        [],
        [],
        null
      );
      expect(result.disclaimer).toContain("NOT include eco-certifications");
      expect(result.unknowns).toContain("carbon_emission_factors_and_fuel_consumption");
      expect(result.unknowns).toContain("eco_certifications_and_green_labels");
    });
  });

  // ==========================================================================
  // 12. HTTP API (Tests 30–31)
  // ==========================================================================
  describe("12. HTTP API — GET /api/v1/sustainability/destinations/:id", () => {
    it("30. returns 400 for invalid UUID", async () => {
      const res = await request(app).get("/api/v1/sustainability/destinations/not-a-uuid");
      expect(res.status).toBe(400);
    });

    it("31. returns 200 with valid destination UUID", async () => {
      const res = await request(app)
        .get(`/api/v1/sustainability/destinations/${mockAraku.id}`)
        .timeout(30000);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.carbonAssessment.status).toBe("unavailable");
    }, 30000);
  });

  // ==========================================================================
  // 13. ARAKU VALLEY SMOKE TEST (Tests 32–33)
  // ==========================================================================
  describe("13. Araku Valley Smoke Test", () => {
    it("32. Araku Valley returns sustainability with unknown status and insufficient quality", async () => {
      const res = await request(app)
        .get(`/api/v1/sustainability/destinations/${mockAraku.id}`)
        .timeout(30000);
      expect(res.status).toBe(200);
      const data: DestinationSustainabilityDto = res.body.data;
      expect(data.destinationName).toMatch(/araku/i);
      // Araku has no eco experiences or nature attractions indexed
      expect(["unknown", "mixed"]).toContain(data.sustainabilityStatus);
      expect(["insufficient", "limited"]).toContain(data.dataQuality.status);
    }, 30000);

    it("33. Araku Valley carbon assessment is always unavailable", async () => {
      const res = await request(app)
        .get(`/api/v1/sustainability/destinations/${mockAraku.id}`)
        .timeout(30000);
      const data: DestinationSustainabilityDto = res.body.data;
      expect(data.carbonAssessment.status).toBe("unavailable");
      expect(data.carbonAssessment.value).toBeNull();
    }, 30000);
  });

  // ==========================================================================
  // 14. AI ORCHESTRATOR (Test 34)
  // ==========================================================================
  describe("14. AI Orchestrator — Sustainability Query Synthesis", () => {
    it("34. deterministic provider synthesizes sustainability_query correctly", async () => {
      const provider = new DeterministicAIProvider();
      const contextData = {
        intent: "sustainability_query",
        entities: { destinationName: "Araku Valley" },
        destination: { id: DEST_ID, name: "Araku Valley", state: "Andhra Pradesh" },
        sustainability: {
          destinationId: DEST_ID,
          destinationName: "Araku Valley",
          state: "Andhra Pradesh",
          sustainabilityStatus: "unknown",
          confidence: null,
          dataQuality: {
            status: "insufficient",
            evidenceCount: 0,
            ecoExperienceCount: 0,
            communityExperienceCount: 0,
            natureAttractionCount: 0,
            communityAccommodationCount: 0,
            transportContextAvailable: false,
            explanation: "No verified sustainability-relevant evidence available."
          },
          carbonAssessment: {
            status: "unavailable",
            value: null,
            unit: null,
            methodology: null,
            explanation:
              "Verified transport mode, emission factors, and fuel consumption data are not available."
          },
          warnings: ["Sustainability status is unknown"],
          disclaimer: "All signals are based strictly on verified database records."
        },
        attractions: [],
        sources: []
      };
      const prompt = `\`\`\`json\n${JSON.stringify(contextData)}\n\`\`\``;
      const result = await provider.generateStructuredResponse<OrchestratorResponseDto>(prompt);
      expect(result.intent).toBe("sustainability_query");
      expect(result.summary).toContain("Sustainability assessment");
      expect(result.sustainability).toBeDefined();
      expect(result.sustainability!.carbonAssessment.status).toBe("unavailable");
    });
  });
});
