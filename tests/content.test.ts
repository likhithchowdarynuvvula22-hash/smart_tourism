import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { galleryAnalyzer } from "../src/services/content/analyzers/gallery.analyzer";
import { contentSummaryAnalyzer } from "../src/services/content/analyzers/contentSummary.analyzer";
import { contentService } from "../src/services/content/content.service";
import { translationService } from "../src/services/external/translation/translation.service";
import { intentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { toolExecutor } from "../src/services/ai/tools/tool.executor";
import { OrchestratorService } from "../src/services/ai/orchestrator.service";
import { DeterministicAIProvider } from "../src/services/ai/providers/deterministic.provider";
import {
  DestinationRow,
  AttractionRow,
  ExperienceRow,
  ImageRow,
  LanguageRow,
  AccessibilityRow,
  ElderlySupportRow,
  EntryFeesRow,
  EmergencyResourceRow
} from "../src/types/database.types";

describe("Phase 7F: Multi-Modal & Content Intelligence Suite", () => {
  beforeEach(() => {
    vi.spyOn(translationService, "translate").mockImplementation(
      async (text: string, sourceLang: string, targetLang: string) => {
        if (targetLang === "unsupported_code_xyz") {
          throw new Error("Simulated translation provider error");
        }
        return {
          translatedText: `[${targetLang.toUpperCase()}] ${text}`,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          match: 0.95
        };
      }
    );
  });

  const mockArakuId = "01e98249-049a-4017-a5fb-98b913e05ca5";
  const mockMadikeriId = "d1523e30-0799-47d5-ae08-cba85e051d24";
  const mockNonExistentId = "99999999-9999-4999-8999-999999999999";

  const sampleDestination: DestinationRow = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Coorg Hill Station",
    state: "Karnataka",
    city: "Madikeri",
    district: "Kodagu",
    description: "Lush coffee plantations, misty hills, and scenic waterfalls",
    destination_code: "COORG-HILL",
    best_time_to_visit: "Oct - Mar",
    rush_free_hours: "08:00 - 10:00",
    latitude: 12.4244,
    longitude: 75.7382,
    source: "Karnataka Tourism Department",
    source_url: "https://karnatakatourism.org",
    verification_status: "verified",
    last_verified: "2026-08-24",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const sampleAttraction: AttractionRow = {
    id: "attr-333-falls",
    destination_id: sampleDestination.id,
    name: "Abbey Falls",
    category: "Natural / Scenic",
    description: "Scenic waterfall cascading amidst spice and coffee estates",
    district: "Kodagu",
    latitude: 12.4542,
    longitude: 75.7176,
    official_url: "https://karnatakatourism.org/abbey-falls",
    source: "Karnataka Tourism",
    source_url: null,
    verification_status: "verified",
    last_verified: "2026-08-24",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    attraction_code: "COORG-ABBEY"
  };

  const sampleImages: ImageRow[] = [
    {
      id: "img-001-falls",
      destination_id: null,
      attraction_id: sampleAttraction.id,
      image_url: "https://assets.karnatakatourism.org/abbey-falls.jpg",
      photographer: "State Tourism Media Cell",
      license: "CC-BY-SA 4.0",
      attribution: "Abbey Falls Waterfall during monsoon",
      usage: "Editorial and tourism promotion",
      source: "Karnataka Tourism Department",
      source_url: "https://karnatakatourism.org/en/attractions/abbey-falls",
      verification_status: "verified",
      created_at: new Date().toISOString()
    },
    {
      id: "img-002-estate",
      destination_id: sampleDestination.id,
      attraction_id: null,
      image_url: "https://assets.karnatakatourism.org/coorg-estates.jpg",
      photographer: null,
      license: "Official Government Tourism Media",
      attribution: null,
      usage: "Public tourism catalog",
      source: "Incredible India Content Hub",
      source_url: "https://www.incredibleindia.gov.in",
      verification_status: "verified",
      created_at: new Date().toISOString()
    }
  ];

  const sampleLanguages: LanguageRow = {
    id: "lang-333",
    destination_id: sampleDestination.id,
    official_language: "Kannada; English",
    local_languages: "Kodava; Arebhashe; Tulu; Beary",
    guide_languages: "Kannada; English; Hindi",
    source: "Census of India / Language Division",
    source_url: "https://censusindia.gov.in",
    verification_status: "state_level_reference",
    last_verified: "2026-08-24"
  };

  const sampleExperiences: ExperienceRow[] = [
    {
      id: "exp-333-coffee",
      experience_code: "EXP-COFFEE",
      destination_id: sampleDestination.id,
      name: "Coffee plantation walking trail and bean harvesting",
      category: "Government tourism development project",
      provider_id: null,
      price: 150,
      currency: "INR",
      duration: null,
      availability: null,
      languages: null,
      accessibility: null,
      verified: true,
      source: "Karnataka Tourism Department",
      source_url: null,
      verification_status: "verified",
      created_at: new Date().toISOString()
    }
  ];

  const sampleAccessibility: AccessibilityRow[] = [
    {
      id: "acc-333",
      attraction_id: sampleAttraction.id,
      wheelchair_access: true,
      ramps: true,
      lifts: false,
      accessible_toilet: true,
      audio_guides: false,
      braille_signage: false,
      walking_difficulty: "Moderate",
      step_count: 50,
      accessible_transit: true,
      source: "Accessibility Audit Cell",
      source_url: null,
      verification_status: "verified",
      last_verified: "2026-08-24"
    }
  ];

  const sampleElderly: ElderlySupportRow[] = [
    {
      id: "eld-333",
      attraction_id: sampleAttraction.id,
      benches: true,
      ramps: true,
      stairs: "Gentle paved steps with side railings",
      source: "Senior Welfare Board Tourism Audit",
      source_url: null,
      verification_status: "verified",
      last_verified: "2026-08-24"
    }
  ];

  const sampleFees: EntryFeesRow[] = [
    {
      id: "fee-333",
      attraction_id: sampleAttraction.id,
      fee_domestic: 30,
      fee_foreign: 100,
      fee_child: 15,
      fee_student: 15,
      fee_senior: 15,
      currency: "INR",
      source: "District Tourism Council Fee Schedule",
      source_url: null,
      verification_status: "verified",
      last_verified: "2026-08-24"
    }
  ];

  const sampleEmergency: EmergencyResourceRow[] = [
    {
      id: "em-333-pol",
      destination_id: sampleDestination.id,
      name: "Madikeri Town Police Station",
      type: "police",
      phone: "08272-228333",
      address: "Madikeri Main Road",
      latitude: null,
      longitude: null,
      opening_hours: null,
      verified: true,
      source: "Karnataka Police Directory",
      source_url: null,
      created_at: new Date().toISOString()
    },
    {
      id: "em-333-wom",
      destination_id: sampleDestination.id,
      name: "Women Helpdesk Kodagu",
      type: "women_helpline",
      phone: "1091",
      address: null,
      latitude: null,
      longitude: null,
      opening_hours: null,
      verified: true,
      source: "National Women Commission",
      source_url: null,
      created_at: new Date().toISOString()
    }
  ];

  // ==========================================
  // SECTION 1: IMAGE DATA & METADATA SUFFICIENCY
  // ==========================================
  describe("1. Image Data & Metadata Sufficiency", () => {
    it("1. should reject invalid destination UUID with 400 Bad Request", async () => {
      const res = await request(app).get("/api/v1/content/destinations/not-a-valid-uuid/images");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/invalid destination id/i);
    });

    it("2. should return 404 for non-existent destination UUID", async () => {
      const res = await request(app).get(
        `/api/v1/content/destinations/${mockNonExistentId}/images`
      );
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/not found/i);
    });

    it("3. should handle destination with zero image records gracefully", () => {
      const gallery = galleryAnalyzer.assessGallery(sampleDestination, [], [sampleAttraction]);
      expect(gallery.coverage.status).toBe("insufficient");
      expect(gallery.coverage.totalImages).toBe(0);
      expect(gallery.images).toHaveLength(0);
    });

    it("4. should classify unverified or limited images as 'limited'", () => {
      const unverifiedImg: ImageRow = {
        id: "img-unv",
        destination_id: sampleDestination.id,
        attraction_id: null,
        image_url: null, // missing url
        photographer: null,
        license: null, // missing license
        attribution: null,
        usage: null,
        source: null,
        source_url: null,
        verification_status: "unverified",
        created_at: new Date().toISOString()
      };
      const gallery = galleryAnalyzer.assessGallery(sampleDestination, [unverifiedImg]);
      expect(gallery.coverage.status).toBe("limited");
    });

    it("5. should classify multiple verified images as 'sufficient'", () => {
      const gallery = galleryAnalyzer.assessGallery(sampleDestination, sampleImages, [
        sampleAttraction
      ]);
      expect(gallery.coverage.status).toBe("sufficient");
      expect(gallery.coverage.totalImages).toBe(2);
      expect(gallery.coverage.withVerifiedLicense).toBeGreaterThanOrEqual(1);
    });

    it("6. should normalize image metadata into ImageItemDto accurately", () => {
      const gallery = galleryAnalyzer.assessGallery(
        sampleDestination,
        [sampleImages[0]],
        [sampleAttraction]
      );
      const img = gallery.images[0];
      expect(img.id).toBe("img-001-falls");
      expect(img.url).toBe("https://assets.karnatakatourism.org/abbey-falls.jpg");
      expect(img.photographer).toBe("State Tourism Media Cell");
      expect(img.license).toBe("CC-BY-SA 4.0");
      expect(img.relatedEntityType).toBe("attraction");
      expect(img.relatedEntityName).toBe("Abbey Falls");
    });

    it("7. should preserve source provenance across image records", () => {
      const gallery = galleryAnalyzer.assessGallery(sampleDestination, sampleImages, [
        sampleAttraction
      ]);
      expect(
        gallery.sources.some((s) => s.resource === "images" || s.resource === "destinations")
      ).toBe(true);
    });

    it("8. should strictly map null license to 'unknown' without assuming public domain", () => {
      const unpricedImg: ImageRow = {
        ...sampleImages[0],
        license: null
      };
      const gallery = galleryAnalyzer.assessGallery(sampleDestination, [unpricedImg]);
      expect(gallery.images[0].license).toBe("unknown");
    });

    it("9. should strictly map null source to 'unknown'", () => {
      const noSourceImg: ImageRow = {
        ...sampleImages[0],
        source: null
      };
      const gallery = galleryAnalyzer.assessGallery(sampleDestination, [noSourceImg]);
      expect(gallery.images[0].source).toBe("unknown");
    });

    it("10. should correctly associate images with child attractions and destinations", () => {
      const gallery = galleryAnalyzer.assessGallery(sampleDestination, sampleImages, [
        sampleAttraction
      ]);
      expect(gallery.images[0].relatedEntityType).toBe("attraction");
      expect(gallery.images[0].relatedEntityName).toBe("Abbey Falls");
      expect(gallery.images[1].relatedEntityType).toBe("destination");
      expect(gallery.images[1].relatedEntityName).toBe("Coorg Hill Station");
    });
  });

  // ==========================================
  // SECTION 2: ACCESSIBLE ALT TEXT
  // ==========================================
  describe("2. Accessible Alt Text Strategy", () => {
    it("11. should preserve explicit source-provided attribution/alt text", () => {
      const gallery = galleryAnalyzer.assessGallery(
        sampleDestination,
        [sampleImages[0]], // Has attribution: "Abbey Falls Waterfall during monsoon"
        [sampleAttraction]
      );
      expect(gallery.images[0].altText).toBe("Abbey Falls Waterfall during monsoon");
      expect(gallery.images[0].generatedFromMetadata).toBe(false);
    });

    it("12. should generate conservative metadata-based alt text when source alt text is null", () => {
      const gallery = galleryAnalyzer.assessGallery(
        sampleDestination,
        [sampleImages[1]], // Attribution is null
        [sampleAttraction]
      );
      expect(gallery.images[0].altText).toBe("View of Coorg Hill Station, Karnataka");
      expect(gallery.images[0].generatedFromMetadata).toBe(true);
    });

    it("13. should generate attraction alt text containing verified name and category", () => {
      const imgNoAttr: ImageRow = {
        ...sampleImages[0],
        attribution: null
      };
      const gallery = galleryAnalyzer.assessGallery(
        sampleDestination,
        [imgNoAttr],
        [sampleAttraction]
      );
      expect(gallery.images[0].altText).toBe(
        "View of Abbey Falls, natural / scenic in Coorg Hill Station"
      );
      expect(gallery.images[0].generatedFromMetadata).toBe(true);
    });

    it("14. should not invent visual facts (weather, crowds, mountains, colors) in generated alt text", () => {
      const gallery = galleryAnalyzer.assessGallery(
        sampleDestination,
        [sampleImages[1]],
        [sampleAttraction]
      );
      const alt = gallery.images[0].altText.toLowerCase();
      expect(alt).not.toMatch(/sunny|cloudy|crowd|steep|blue|green|beautiful|stunning/i);
    });
  });

  // ==========================================
  // SECTION 3: MULTILINGUAL CONTENT & TRANSLATION
  // ==========================================
  describe("3. Multilingual Content & Translation Grounding", () => {
    it("15. should retrieve supported languages from verified languages table", async () => {
      const content = await contentService.getMultilingualContent(mockArakuId, "te");
      expect(content.supportedLanguagesInDestination.official).toBeDefined();
      expect(content.isSupportedLocally).toBe(true);
    });

    it("16. should indicate isSupportedLocally: false when requested language is not catalogued", async () => {
      const content = await contentService.getMultilingualContent(mockArakuId, "french");
      expect(content.isSupportedLocally).toBe(false);
      expect(content.requestedLanguage).toBe("french");
    });

    it("17. should translate destination and attractions into requested target language", async () => {
      const content = await contentService.getMultilingualContent(mockArakuId, "hindi");
      expect(content.destinationName.translated).toBeDefined();
      expect(content.destinationName.original).toBe("Araku Valley");
    });

    it("18. should preserve dual-language original and translated text for provenance", async () => {
      const content = await contentService.getMultilingualContent(mockArakuId, "te");
      expect(content.destinationName.original).toBe("Araku Valley");
      expect(content.destinationName.translated).toBeDefined();
      expect(content.disclaimers[0].original).toBeDefined();
      expect(content.disclaimers[0].translated).toBeDefined();
    });

    it("19. should handle translation failure gracefully by falling back to original text", async () => {
      const content = await contentService.getMultilingualContent(
        mockArakuId,
        "unsupported_code_xyz"
      );
      expect(content.destinationName.original).toBe("Araku Valley");
      expect(content.destinationName.translated).toBe("Araku Valley");
    });

    it("20. should preserve source provenance across multilingual content", async () => {
      const content = await contentService.getMultilingualContent(mockArakuId, "te");
      expect(
        content.sources.some((s) => s.resource === "destinations" || s.resource === "languages")
      ).toBe(true);
    });
  });

  // ==========================================
  // SECTION 4: CONTENT RETRIEVAL & GROUNDED SUMMARY
  // ==========================================
  describe("4. Content Retrieval & Grounded Summaries", () => {
    it("21. should retrieve destination summary with structured sections", () => {
      const summary = contentSummaryAnalyzer.generateSummary(
        sampleDestination,
        [sampleAttraction],
        sampleExperiences,
        sampleLanguages,
        sampleAccessibility,
        sampleElderly,
        sampleFees,
        sampleEmergency
      );
      expect(summary.destinationName).toBe("Coorg Hill Station");
      expect(summary.sections.overview).toBeDefined();
      expect(summary.sections.attractions).toHaveLength(1);
      expect(summary.sections.experiences).toHaveLength(1);
    });

    it("22. should correctly structure attraction and experience sections", () => {
      const summary = contentSummaryAnalyzer.generateSummary(
        sampleDestination,
        [sampleAttraction],
        sampleExperiences,
        sampleLanguages
      );
      expect(summary.sections.attractions[0].name).toBe("Abbey Falls");
      expect(summary.sections.experiences[0].name).toContain("Coffee plantation");
    });

    it("23. should correctly include language breakdown in summary", () => {
      const summary = contentSummaryAnalyzer.generateSummary(
        sampleDestination,
        [sampleAttraction],
        sampleExperiences,
        sampleLanguages
      );
      expect(summary.sections.languages.official).toBe("Kannada; English");
      expect(summary.sections.languages.local).toContain("Kodava");
    });

    it("24. should generate grounded narrative summary without inventing facts", () => {
      const summary = contentSummaryAnalyzer.generateSummary(
        sampleDestination,
        [sampleAttraction],
        sampleExperiences,
        sampleLanguages
      );
      expect(summary.summary).toContain("Coorg Hill Station is a verified tourist destination");
      expect(summary.summary).toContain("Karnataka");
    });

    it("25. should explicitly disclose uncatalogued items in unknowns", () => {
      const summary = contentSummaryAnalyzer.generateSummary(
        sampleDestination,
        [sampleAttraction],
        sampleExperiences,
        sampleLanguages
      );
      expect(summary.unknowns).toContain("uncatalogued_local_festivals_and_event_schedules");
      expect(summary.unknowns).toContain("unrecorded_dining_and_restaurant_menus");
    });

    it("26. should maintain disclaimer about verified records provenance", () => {
      const summary = contentSummaryAnalyzer.generateSummary(
        sampleDestination,
        [sampleAttraction],
        sampleExperiences,
        sampleLanguages
      );
      expect(summary.disclaimer).toMatch(/synthesized strictly from verified database records/i);
    });
  });

  // ==========================================
  // SECTION 5: AI TOOL & ORCHESTRATOR INTEGRATION
  // ==========================================
  describe("5. AI Tool & Orchestrator Integration", () => {
    it("27. should classify content_query intent for photo questions", () => {
      const result = intentClassifier.classify("Show me photos and gallery of Araku");
      expect(result.intent).toBe("content_query");
      expect(result.requiredTools).toContain("content_intelligence");
    });

    it("28. should classify content_query intent for multilingual questions", () => {
      const result = intentClassifier.classify("Describe this destination in Telugu");
      expect(result.intent).toBe("content_query");
      expect(result.entities.targetLanguage).toBe("telugu");
      expect(result.requiredTools).toContain("content_intelligence");
    });

    it("29. should execute content_intelligence tool safely via toolExecutor", async () => {
      const context = await toolExecutor.executeTools(["content_intelligence"], {
        destinationId: mockMadikeriId
      });
      expect(context.gallery).toBeDefined();
      expect(context.content_summary).toBeDefined();
      expect(
        context.sources.some((s) => s.resource === "destinations" || s.resource === "images")
      ).toBe(true);
    });

    it("30. should execute multilingual content_intelligence when targetLanguage is present", async () => {
      const context = await toolExecutor.executeTools(["content_intelligence"], {
        destinationId: mockArakuId,
        targetLanguage: "hindi"
      });
      expect(context.multilingual_content).toBeDefined();
      expect(context.multilingual_content?.destinationName.original).toBe("Araku Valley");
    });

    it("31. should generate grounded AI response for content_query via orchestrator", async () => {
      const orchestrator = new OrchestratorService(
        new DeterministicAIProvider(),
        new DeterministicAIProvider()
      );
      const response = await orchestrator.chat("Show me gallery photos of Madikeri");
      expect(response.intent).toBe("content_query");
      expect(response.summary).toBeDefined();
      expect(response.gallery).toBeDefined();
      expect(response.sources.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // SECTION 6: CROSS-PHASE INTELLIGENCE INTEGRATIONS
  // ==========================================
  describe("6. Cross-Phase Intelligence Integrations", () => {
    it("32. should integrate verified accessibility counts into content summary (Phase 7C)", () => {
      const summary = contentSummaryAnalyzer.generateSummary(
        sampleDestination,
        [sampleAttraction],
        [],
        sampleLanguages,
        sampleAccessibility
      );
      expect(summary.sections.accessibility.wheelchairAccessibleCount).toBe(1);
      expect(summary.sections.accessibility.notes[0]).toContain("verified wheelchair access");
    });

    it("33. should integrate verified senior resting benches into content summary (Phase 7C)", () => {
      const summary = contentSummaryAnalyzer.generateSummary(
        sampleDestination,
        [sampleAttraction],
        [],
        sampleLanguages,
        [],
        sampleElderly
      );
      expect(summary.sections.accessibility.seniorFriendlyCount).toBe(1);
      expect(
        summary.sections.accessibility.notes.some((n) => n.includes("verified resting benches"))
      ).toBe(true);
    });

    it("34. should integrate verified entry fee counts into content summary (Phase 7D)", () => {
      const summary = contentSummaryAnalyzer.generateSummary(
        sampleDestination,
        [sampleAttraction],
        [],
        sampleLanguages,
        [],
        [],
        sampleFees
      );
      expect(summary.sections.costs.knownEntryFeeAttractionsCount).toBe(1);
    });

    it("35. should integrate verified emergency helplines into content summary (Phase 7B)", () => {
      const summary = contentSummaryAnalyzer.generateSummary(
        sampleDestination,
        [sampleAttraction],
        [],
        sampleLanguages,
        [],
        [],
        [],
        sampleEmergency
      );
      expect(summary.sections.safety.nationalEmergency).toBe("08272-228333");
      expect(summary.sections.safety.womenHelpline).toBe("1091");
    });

    it("36. should integrate verified experience projects into content summary (Phase 7E)", () => {
      const summary = contentSummaryAnalyzer.generateSummary(
        sampleDestination,
        [sampleAttraction],
        sampleExperiences,
        sampleLanguages
      );
      expect(summary.sections.experiences[0].name).toContain("Coffee plantation");
    });
  });

  // ==========================================
  // SECTION 7: SECURITY & API ENDPOINTS
  // ==========================================
  describe("7. Security & API Endpoints", () => {
    it("37. should serve GET /api/v1/content/destinations/:id/images publicly without auth", async () => {
      const res = await request(app).get(`/api/v1/content/destinations/${mockMadikeriId}/images`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationId).toBe(mockMadikeriId);
      expect(res.body.data.coverage).toBeDefined();
      expect(res.body.data.images).toBeDefined();
    });

    it("38. should ensure zero user data or authorization leaks in content responses", async () => {
      const res = await request(app).get(`/api/v1/content/destinations/${mockMadikeriId}/summary`);
      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBeUndefined();
      expect(res.body.data.user_id).toBeUndefined();
      expect(res.body.data.token).toBeUndefined();
    });
  });
});
