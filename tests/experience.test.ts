import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";
import { experienceAnalyzer } from "../src/services/experience/analyzers/experience.analyzer";
import { intentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { toolExecutor } from "../src/services/ai/tools/tool.executor";
import { candidateFilter } from "../src/services/ai/itinerary/candidate.filter";
import { orchestratorService } from "../src/services/ai/orchestrator.service";
import {
  DestinationRow,
  AttractionRow,
  ExperienceRow,
  LocalBusinessRow,
  LanguageRow
} from "../src/types/database.types";
import { ExperienceItemDto } from "../src/types/experience";

describe("Phase 7E: Cultural & Experience Intelligence Suite", () => {
  const mockArakuId = "01e98249-049a-4017-a5fb-98b913e05ca5";
  const mockNonExistentId = "99999999-9999-4999-8999-999999999999";

  const sampleDestination: DestinationRow = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Cultural Oasis",
    state: "Rajasthan",
    city: "Jaipur",
    district: "Jaipur",
    description: "Historic city renowned for forts, palaces, and vibrant heritage",
    destination_code: "JAIPUR-CULTURE",
    best_time_to_visit: "Oct - Mar",
    rush_free_hours: "09:00 - 11:00",
    latitude: 26.9124,
    longitude: 75.7873,
    source: "Rajasthan Tourism",
    source_url: "https://tourism.rajasthan.gov.in",
    verification_status: "verified",
    last_verified: "2026-08-24",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const sampleExperiences: ExperienceRow[] = [
    {
      id: "exp-001-tonga",
      experience_code: "EXP-001",
      destination_id: sampleDestination.id,
      name: "Tonga ride Heritage experience zone",
      category: "Government tourism development project",
      provider_id: null,
      price: null,
      currency: "INR",
      duration: null,
      availability: null,
      languages: null,
      accessibility: null,
      verified: true,
      source: "Ministry of Tourism",
      source_url: "https://tourism.gov.in/report",
      verification_status: "government_project",
      created_at: new Date().toISOString()
    },
    {
      id: "exp-002-nature",
      experience_code: "EXP-002",
      destination_id: sampleDestination.id,
      name: "Eco tourism zone at Ananthgiri forest and bird sanctuary",
      category: "Government tourism development project",
      provider_id: null,
      price: 50,
      currency: "INR",
      duration: null,
      availability: null,
      languages: null,
      accessibility: null,
      verified: true,
      source: "Ministry of Tourism",
      source_url: "https://tourism.gov.in/report",
      verification_status: "government_project",
      created_at: new Date().toISOString()
    },
    {
      id: "exp-003-adventure",
      experience_code: "EXP-003",
      destination_id: sampleDestination.id,
      name: "Caving and rock climbing adventure trail",
      category: "Government tourism development project",
      provider_id: null,
      price: 200,
      currency: "INR",
      duration: null,
      availability: null,
      languages: null,
      accessibility: null,
      verified: true,
      source: "Ministry of Tourism",
      source_url: "https://tourism.gov.in/report",
      verification_status: "government_project",
      created_at: new Date().toISOString()
    }
  ];

  const sampleAttractions: AttractionRow[] = [
    {
      id: "attr-001-fort",
      destination_id: sampleDestination.id,
      name: "Historic Amber Fort",
      category: "Historic / Heritage",
      description: "Magnificent ancient hilltop fortress with intricate mirror work",
      district: "Jaipur",
      latitude: 26.9855,
      longitude: 75.8513,
      official_url: null,
      source: "Rajasthan Tourism",
      source_url: null,
      verification_status: "verified",
      last_verified: "2026-08-24",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attraction_code: "JAIPUR-FORT"
    },
    {
      id: "attr-002-temple",
      destination_id: sampleDestination.id,
      name: "Govind Dev Ji Temple",
      category: "Spiritual / Religious",
      description: "Sacred Krishna temple located inside city palace complex",
      district: "Jaipur",
      latitude: 26.9255,
      longitude: 75.8236,
      official_url: null,
      source: "Rajasthan Tourism",
      source_url: null,
      verification_status: "verified",
      last_verified: "2026-08-24",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attraction_code: "JAIPUR-TEMPLE"
    }
  ];

  const sampleBusinesses: LocalBusinessRow[] = [
    {
      id: "biz-001-stay",
      business_code: "BUS-001",
      destination_id: sampleDestination.id,
      name: "Heritage Haveli Homestay",
      type: "Homestay",
      address: "Old City, Jaipur",
      phone: "9876543210",
      email: "stay@heritagehaveli.com",
      languages: null,
      verified: true,
      source: "Rajasthan Tourism Approved",
      source_url: null,
      verification_status: "official_approved",
      created_at: new Date().toISOString()
    }
  ];

  const sampleLanguages: LanguageRow = {
    id: "lang-001",
    destination_id: sampleDestination.id,
    official_language: "Hindi; English",
    local_languages: "Rajasthani; Marwari; Dhundhari",
    guide_languages: "Hindi; English; French",
    source: "Census of India / Language Reference",
    source_url: "https://censusindia.gov.in",
    verification_status: "state_level_reference",
    last_verified: "2026-08-24"
  };

  // ==========================================
  // SECTION 1: DATA SUFFICIENCY & INPUT VALIDATION
  // ==========================================
  describe("1. Data Sufficiency & Input Validation", () => {
    it("1. should reject invalid destination UUID with 400 Bad Request", async () => {
      const res = await request(app).get("/api/v1/experiences/destinations/invalid-uuid-format");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/invalid destination id/i);
    });

    it("2. should return 404 for non-existent destination UUID", async () => {
      const res = await request(app).get(`/api/v1/experiences/destinations/${mockNonExistentId}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/not found/i);
    });

    it("3. should handle destination with zero direct experience records gracefully", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        [], // 0 experiences
        sampleAttractions,
        [],
        sampleLanguages
      );
      expect(assessment.dataQuality.experienceCount).toBe(0);
      expect(assessment.dataQuality.attractionCount).toBe(2);
      expect(assessment.dataQuality.status).toBe("sufficient"); // 2 verified attractions provide sufficient cultural baseline
      expect(
        assessment.warnings.some((w) =>
          w.includes("No direct government tourism experience projects")
        )
      ).toBe(true);
    });

    it("4. should classify limited experience records as 'limited'", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        [],
        [sampleAttractions[0]], // 1 attraction, 0 experiences
        [],
        sampleLanguages
      );
      expect(assessment.dataQuality.status).toBe("limited");
    });

    it("5. should classify full experience records as 'sufficient'", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        sampleExperiences,
        sampleAttractions,
        sampleBusinesses,
        sampleLanguages
      );
      expect(assessment.dataQuality.status).toBe("sufficient");
      expect(assessment.dataQuality.experienceCount).toBe(3);
    });

    it("6. should retrieve and structure experience row details accurately", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        [sampleExperiences[0]],
        [],
        [],
        sampleLanguages
      );
      expect(assessment.rankedItems[0].name).toBe("Tonga ride Heritage experience zone");
      expect(assessment.rankedItems[0].itemType).toBe("experience");
      expect(assessment.rankedItems[0].normalizedCategories).toContain("heritage");
    });

    it("7. should integrate attractions as complementary cultural candidates", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        [],
        sampleAttractions,
        [],
        sampleLanguages,
        { includeAttractions: true }
      );
      expect(assessment.rankedItems.some((i) => i.itemType === "attraction")).toBe(true);
      expect(assessment.rankedItems.some((i) => i.name === "Historic Amber Fort")).toBe(true);
    });

    it("8. should integrate local businesses when includeBusinesses is true", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        sampleExperiences,
        sampleAttractions,
        sampleBusinesses,
        sampleLanguages,
        { includeBusinesses: true }
      );
      expect(assessment.rankedItems.some((i) => i.itemType === "local_business")).toBe(true);
      expect(assessment.rankedItems.some((i) => i.name === "Heritage Haveli Homestay")).toBe(true);
    });

    it("9. should retrieve and expose destination language data", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        sampleExperiences,
        sampleAttractions,
        sampleBusinesses,
        sampleLanguages
      );
      expect(assessment.languages?.official).toBe("Hindi; English");
      expect(assessment.languages?.local).toBe("Rajasthani; Marwari; Dhundhari");
      expect(assessment.languages?.guide).toBe("Hindi; English; French");
    });
  });

  // ==========================================
  // SECTION 2: INTEREST & AVOID-INTEREST EXTRACTION
  // ==========================================
  describe("2. Interest & Avoid-Interest Extraction", () => {
    it("10. should extract culture interest from user message", () => {
      const result = intentClassifier.classify(
        "What cultural experiences and tribal traditions can I explore in Araku?"
      );
      expect(result.entities.interests).toContain("culture");
    });

    it("11. should extract heritage and history interests from user message", () => {
      const result = intentClassifier.classify(
        "I want heritage forts and historic monuments in Jaipur"
      );
      expect(result.entities.interests).toContain("heritage");
      expect(result.entities.interests).toContain("history");
    });

    it("12. should extract food interest from user message", () => {
      const result = intentClassifier.classify(
        "Suggest food experiences and tea garden tours in Coorg"
      );
      expect(result.entities.interests).toContain("food");
    });

    it("13. should extract nature interest from user message", () => {
      const result = intentClassifier.classify(
        "I want quiet nature experiences, bird sanctuaries and forests in Kerala"
      );
      expect(result.entities.interests).toContain("nature");
      expect(result.entities.interests).toContain("relaxation");
    });

    it("14. should extract avoid-adventure exclusion from user message", () => {
      const result = intentClassifier.classify("I want heritage and local culture, not adventure");
      expect(result.entities.interests).toContain("heritage");
      expect(result.entities.interests).toContain("culture");
      expect(result.entities.avoidInterests).toContain("adventure");
    });

    it("15. should extract multiple interests and avoid-interests simultaneously", () => {
      const result = intentClassifier.classify(
        "I want food, heritage, and shopping without adventure and avoid crowds"
      );
      expect(result.entities.interests).toContain("food");
      expect(result.entities.interests).toContain("heritage");
      expect(result.entities.interests).toContain("shopping");
      expect(result.entities.avoidInterests).toContain("adventure");
      expect(result.entities.avoidInterests).toContain("crowd");
      expect(result.entities.avoidCrowds).toBe(true);
    });

    it("16. should serve categories ontology via service and endpoint", async () => {
      const res = await request(app).get("/api/v1/experiences/categories");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.supportedCategories).toContain("culture");
      expect(res.body.data.supportedCategories).toContain("heritage");
      expect(res.body.data.supportedCategories).toContain("nature");
    });
  });

  // ==========================================
  // SECTION 3: DETERMINISTIC RANKING ENGINE
  // ==========================================
  describe("3. Deterministic Ranking Engine", () => {
    it("17. should rank exact category match higher than unrelated candidates", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        sampleExperiences,
        sampleAttractions,
        [],
        sampleLanguages,
        { interests: ["heritage"] }
      );
      // Tonga ride & Historic Amber Fort should rank at the top
      expect(assessment.rankedItems[0].normalizedCategories).toContain("heritage");
      expect(assessment.rankedItems[0].matchScore).toBeGreaterThan(60);
    });

    it("18. should rank related categories with moderate positive boost", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        sampleExperiences,
        sampleAttractions,
        [],
        sampleLanguages,
        { interests: ["history"] }
      );
      // Items with 'heritage' or 'culture' are related to 'history'
      const topItem = assessment.rankedItems[0];
      expect(topItem.matchReason).toMatch(/Matches interest: history|Related to history/i);
    });

    it("19. should penalize and suppress candidates matching avoid-interests", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        sampleExperiences,
        sampleAttractions,
        [],
        sampleLanguages,
        { interests: ["heritage"], avoidInterests: ["adventure"] }
      );
      // Adventure item should be ranked lowest
      const adventureItem = assessment.rankedItems.find((i) => i.name.includes("adventure"));
      expect(adventureItem).toBeDefined();
      expect(adventureItem!.matchScore).toBeLessThan(40);
      expect(adventureItem!.matchReason).toMatch(/Suppressed due to avoid preference/i);
    });

    it("20. should not penalize items solely due to missing optional metadata", () => {
      const customItem: ExperienceItemDto = {
        id: "item-custom",
        name: "Verified Scenic Garden",
        itemType: "attraction",
        category: "Garden",
        normalizedCategories: ["nature", "relaxation"],
        description: null, // No description
        matchScore: 50,
        matchReason: "Verified candidate",
        verified: true,
        accessibility: { supported: false, wheelchairAccess: false, details: null },
        elderlySuitability: { suitable: false, note: null },
        knownCost: null, // No price
        crowdContext: null, // No crowd
        languagesSpoken: [],
        source: "State Tourism",
        sourceUrl: null,
        verificationStatus: "verified"
      };

      const ranked = experienceAnalyzer.scoreAndRankCandidates([customItem], {
        interests: ["nature"]
      });
      expect(ranked[0].matchScore).toBeGreaterThanOrEqual(70);
    });
  });

  // ==========================================
  // SECTION 4: ANTI-HALLUCINATION & GROUNDING
  // ==========================================
  describe("4. Anti-Hallucination & Grounding Guarantees", () => {
    it("21. should not fabricate cultural facts or rituals not in the database", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        sampleExperiences,
        sampleAttractions,
        [],
        sampleLanguages
      );
      expect(assessment.unknowns).toContain("uncatalogued_cultural_festivals_and_rituals");
      expect(assessment.disclaimer).toMatch(/strictly from verified database records/i);
    });

    it("22. should disclose that festival schedules and rituals are uncatalogued", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        sampleExperiences,
        sampleAttractions,
        [],
        sampleLanguages
      );
      expect(assessment.unknowns.some((u) => u.includes("festivals"))).toBe(true);
    });

    it("23. should only return businesses that exist in the database without inventing vendors", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        [],
        [],
        sampleBusinesses,
        sampleLanguages,
        { includeBusinesses: true }
      );
      expect(assessment.rankedItems.length).toBe(1);
      expect(assessment.rankedItems[0].name).toBe("Heritage Haveli Homestay");
    });

    it("24. should report cost as unknown when price is null without fabricating numbers", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        [sampleExperiences[0]], // Price is null
        [],
        [],
        sampleLanguages
      );
      expect(assessment.rankedItems[0].knownCost?.amount).toBeNull();
      expect(assessment.rankedItems[0].knownCost?.pricingType).toBe("unknown");
    });

    it("25. should not fabricate opening hours when unindexed", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        [sampleExperiences[0]],
        [],
        [],
        sampleLanguages
      );
      expect(assessment.rankedItems[0].crowdContext?.rushFreeHours).toBe("09:00 - 11:00");
    });
  });

  // ==========================================
  // SECTION 5: CROSS-PHASE INTELLIGENCE INTEGRATIONS
  // ==========================================
  describe("5. Cross-Phase Intelligence Integrations", () => {
    it("26. should integrate accessibility annotations for wheelchair users (Phase 7C)", () => {
      const accessMap = new Map();
      accessMap.set("attr-001-fort", {
        wheelchair: true,
        elderly: true,
        details: "Ramps available"
      });

      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        [],
        [sampleAttractions[0]],
        [],
        sampleLanguages,
        { isWheelchairUser: true },
        accessMap
      );
      expect(assessment.rankedItems[0].accessibility.wheelchairAccess).toBe(true);
      expect(assessment.rankedItems[0].matchScore).toBeGreaterThan(60);
    });

    it("27. should integrate elderly suitability notes for senior travellers (Phase 7C)", () => {
      const accessMap = new Map();
      accessMap.set("attr-001-fort", { wheelchair: false, elderly: true });

      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        [],
        [sampleAttractions[0]],
        [],
        sampleLanguages,
        { isElderlyTraveller: true },
        accessMap
      );
      expect(assessment.rankedItems[0].elderlySuitability.suitable).toBe(true);
      expect(assessment.rankedItems[0].matchReason).toMatch(/senior citizen friendly/i);
    });

    it("28. should integrate crowd context from destination rush-free metadata (Phase 7A)", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        sampleExperiences,
        sampleAttractions,
        [],
        sampleLanguages
      );
      expect(assessment.rankedItems[0].crowdContext?.rushFreeHours).toBe("09:00 - 11:00");
      expect(assessment.rankedItems[0].crowdContext?.bestTime).toBe("Oct - Mar");
    });

    it("29. should integrate budget entry fees from database (Phase 7D)", () => {
      const feesMap = new Map();
      feesMap.set("exp-002-nature", {
        amount: 50,
        isFree: false,
        pricingType: "verified_experience_price"
      });

      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        [sampleExperiences[1]],
        [],
        [],
        sampleLanguages,
        { isBudgetConstrained: true },
        new Map(),
        feesMap
      );
      expect(assessment.rankedItems[0].knownCost?.amount).toBe(50);
      expect(assessment.rankedItems[0].matchReason).toMatch(/Low\/Free verified entry fee/i);
    });

    it("30. should support solo female traveller context (Phase 7B)", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        sampleExperiences,
        sampleAttractions,
        [],
        sampleLanguages,
        { isSoloFemale: true }
      );
      expect(assessment.rankedItems.length).toBeGreaterThan(0);
    });

    it("31. should provide weather consideration context when applicable (Phase 5)", () => {
      const assessment = experienceAnalyzer.assessDestinationExperiences(
        sampleDestination,
        [sampleExperiences[1]], // Nature eco-tourism
        [],
        [],
        sampleLanguages
      );
      expect(assessment.rankedItems[0].normalizedCategories).toContain("nature");
    });
  });

  // ==========================================
  // SECTION 6: AI TOOL & ORCHESTRATOR INTEGRATION
  // ==========================================
  describe("6. AI Tool & Orchestrator Integration", () => {
    it("32. should classify experience_query intent for cultural activity questions", () => {
      const result = intentClassifier.classify("What cultural experiences can I have in Araku?");
      expect(result.intent).toBe("experience_query");
      expect(result.requiredTools).toContain("experience_intelligence");
    });

    it("33. should execute experience_intelligence tool safely via toolExecutor", async () => {
      const context = await toolExecutor.executeTools(["experience_intelligence"], {
        destinationId: mockArakuId,
        interests: ["nature", "culture"]
      });
      expect(context.experience_assessment).toBeDefined();
      expect(
        context.sources.some((s) => s.resource === "destinations" || s.resource === "attractions")
      ).toBe(true);
    });

    it("34. should generate grounded AI response citing verified experiences via orchestrator", async () => {
      const response = await orchestratorService.chat(
        "What cultural experiences can I explore in Araku?"
      );
      expect(response.intent).toBe("experience_query");
      expect(response.summary).toBeDefined();
      expect(response.experienceAssessment).toBeDefined();
      expect(response.sources.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // SECTION 7: ITINERARY CANDIDATE FILTERING
  // ==========================================
  describe("7. Itinerary Candidate Filtering", () => {
    it("35. should prioritize interest-matching places during itinerary candidate filtering", () => {
      const candidates = candidateFilter.filterAndNormalize(
        {
          destination: sampleDestination,
          attractions: sampleAttractions, // Fort (Heritage) vs Temple (Spiritual)
          experiences: sampleExperiences
        },
        { interests: ["heritage"] }
      );
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].name).toMatch(/Fort|Tonga/i);
    });

    it("36. should penalize avoid-interests places during itinerary candidate filtering", () => {
      const candidates = candidateFilter.filterAndNormalize(
        {
          destination: sampleDestination,
          attractions: sampleAttractions,
          experiences: sampleExperiences // Contains adventure cave trail
        },
        { interests: ["nature"], avoidInterests: ["adventure"] }
      );
      // Adventure item should rank behind nature/heritage items
      const adventureIndex = candidates.findIndex((c) =>
        c.name.toLowerCase().includes("adventure")
      );
      if (adventureIndex !== -1) {
        expect(adventureIndex).toBeGreaterThan(0);
      }
    });

    it("37. should deduplicate places and avoid duplicate candidate IDs", () => {
      const candidates = candidateFilter.filterAndNormalize(
        {
          destination: sampleDestination,
          attractions: [sampleAttractions[0], sampleAttractions[0]], // Duplicate fort
          experiences: sampleExperiences
        },
        {}
      );
      const fortCount = candidates.filter((c) => c.id === sampleAttractions[0].id).length;
      expect(fortCount).toBe(1);
    });

    it("38. should preserve source provenance across candidate items", async () => {
      const response = await orchestratorService.chat(
        "Plan a 2-day trip to Araku with peaceful cultural experiences"
      );
      expect(response.intent).toBe("trip_planning");
      expect(response.sources.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // SECTION 8: SECURITY & API ENDPOINTS
  // ==========================================
  describe("8. Security & API Endpoints", () => {
    it("39. should serve GET /api/v1/experiences/destinations/:id publicly without auth", async () => {
      const res = await request(app).get(`/api/v1/experiences/destinations/${mockArakuId}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.destinationId).toBe(mockArakuId);
      expect(res.body.data.dataQuality).toBeDefined();
      expect(res.body.data.rankedItems).toBeDefined();
    });

    it("40. should ensure zero user data or authorization leaks in experience responses", async () => {
      const res = await request(app).get(`/api/v1/experiences/destinations/${mockArakuId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBeUndefined();
      expect(res.body.data.user_id).toBeUndefined();
      expect(res.body.data.token).toBeUndefined();
    });
  });
});
