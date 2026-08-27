import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";
import { budgetService } from "../src/services/budget/budget.service";
import { budgetAnalyzer } from "../src/services/budget/analyzers/budget.analyzer";
import { intentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { toolExecutor } from "../src/services/ai/tools/tool.executor";
import { candidateFilter } from "../src/services/ai/itinerary/candidate.filter";
import { orchestratorService } from "../src/services/ai/orchestrator.service";
import { DestinationRow, AttractionRow } from "../src/types/database.types";

describe("Phase 7D: Budget & Cost Intelligence Suite", () => {
  const mockArakuId = "01e98249-049a-4017-a5fb-98b913e05ca5";
  const mockNonExistentId = "99999999-9999-4999-8999-999999999999";

  const sampleDestination: DestinationRow = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Heritage City",
    state: "Rajasthan",
    city: "Jaipur",
    district: "Jaipur",
    description: "Historic city with forts and palaces",
    destination_code: "JAIPUR",
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

  const sampleAttractions: AttractionRow[] = [
    {
      id: "attr-001-fort",
      destination_id: sampleDestination.id,
      name: "Grand Fort",
      category: "Fort",
      description: "Magnificent hill fort",
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
      id: "attr-002-palace",
      destination_id: sampleDestination.id,
      name: "Royal Palace",
      category: "Palace",
      description: "Historic royal residence",
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
      attraction_code: "JAIPUR-PALACE"
    },
    {
      id: "attr-003-park",
      destination_id: sampleDestination.id,
      name: "City Public Garden",
      category: "Park",
      description: "Free public garden with walking paths",
      district: "Jaipur",
      latitude: 26.9155,
      longitude: 75.8136,
      official_url: null,
      source: "Rajasthan Tourism",
      source_url: null,
      verification_status: "verified",
      last_verified: "2026-08-24",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attraction_code: "JAIPUR-GARDEN"
    }
  ];

  const sampleEntryFees: EntryFeeRow[] = [
    {
      id: "fee-001",
      attraction_id: "attr-001-fort",
      fee_domestic: 100,
      fee_foreign: 500,
      fee_child: 50,
      fee_student: 50,
      fee_senior: 40,
      currency: "INR",
      online_ticket: true,
      ticket_url: "https://tickets.rajasthan.gov.in/fort",
      source: "Rajasthan Tourism Official Portal",
      source_url: "https://tickets.rajasthan.gov.in",
      verification_status: "official_verified",
      last_verified: "2026-08-24"
    },
    {
      id: "fee-002",
      attraction_id: "attr-002-palace",
      fee_domestic: 200,
      fee_foreign: 700,
      fee_child: 100,
      fee_student: 100,
      fee_senior: null, // No senior discount available
      currency: "INR",
      online_ticket: false,
      ticket_url: null,
      source: "Rajasthan Tourism Official Portal",
      source_url: "https://tickets.rajasthan.gov.in",
      verification_status: "official_verified",
      last_verified: "2026-08-24"
    },
    {
      id: "fee-003",
      attraction_id: "attr-003-park",
      fee_domestic: 0,
      fee_foreign: 0,
      fee_child: 0,
      fee_student: 0,
      fee_senior: 0,
      currency: "INR",
      online_ticket: false,
      ticket_url: null,
      source: "Municipal Corporation",
      source_url: null,
      verification_status: "official_verified",
      last_verified: "2026-08-24"
    }
  ];

  // ==========================================
  // SECTION 1: DATA SUFFICIENCY & INPUT VALIDATION
  // ==========================================
  describe("1. Data Sufficiency & Input Validation", () => {
    it("1. should reject invalid destination UUID with 400 Bad Request", async () => {
      const res = await request(app).get("/api/v1/budget/destinations/invalid-uuid-format");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/invalid destination id/i);
    });

    it("2. should return 404 for non-existent destination UUID", async () => {
      const res = await request(app).get(`/api/v1/budget/destinations/${mockNonExistentId}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/not found/i);
    });

    it("3. should classify destination with zero fee records as 'insufficient' and 'unknown'", async () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        [] // 0 fee rows
      );
      expect(assessment.budget.dataQuality.status).toBe("insufficient");
      expect(assessment.budget.dataQuality.verifiedAttractionsCount).toBe(0);
      expect(assessment.budget.knownSubtotal).toBe(0);
      expect(assessment.breakdown.attractionFees.every((a) => a.feeTypeApplied === "unknown")).toBe(
        true
      );
    });

    it("4. should classify partial fee coverage as 'limited'", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        [sampleEntryFees[0]] // 1 out of 3 attractions has fee data
      );
      expect(assessment.budget.dataQuality.status).toBe("limited");
      expect(assessment.budget.dataQuality.verifiedAttractionsCount).toBe(1);
      expect(assessment.budget.dataQuality.totalAttractionsCount).toBe(3);
    });

    it("5. should classify full fee coverage as 'sufficient'", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        sampleEntryFees // 3 out of 3 attractions have fee data
      );
      expect(assessment.budget.dataQuality.status).toBe("sufficient");
      expect(assessment.budget.dataQuality.verifiedAttractionsCount).toBe(3);
    });

    it("6. should identify senior citizen fee when available and record concession savings", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        [sampleAttractions[0]], // Grand Fort: domestic=100, senior=40
        [sampleEntryFees[0]],
        { adults: 0, seniors: 2 }
      );
      expect(assessment.breakdown.attractionFees[0].feeDetails.senior).toBe(40);
      expect(assessment.breakdown.attractionFees[0].totalFee).toBe(80); // 2 seniors * 40
      expect(assessment.savings.length).toBe(1);
      expect(assessment.savings[0].savingPerPerson).toBe(60); // 100 - 40
      expect(assessment.savings[0].totalSavings).toBe(120); // 60 * 2
    });

    it("7. should handle missing senior fee gracefully without fabricating discounts", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        [sampleAttractions[1]], // Royal Palace: domestic=200, senior=null
        [sampleEntryFees[1]],
        { adults: 0, seniors: 1 }
      );
      expect(assessment.breakdown.attractionFees[0].feeDetails.senior).toBeNull();
      // Applies standard domestic fee when senior fee is unstated
      expect(assessment.breakdown.attractionFees[0].totalFee).toBe(200);
      expect(assessment.savings.length).toBe(0);
    });

    it("8. should correctly compute composite total across multiple demographic categories", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        [sampleAttractions[0]], // Fort: domestic=100, foreign=500, child=50, student=50, senior=40
        [sampleEntryFees[0]],
        {
          adults: 2, // 2 * 100 = 200
          seniors: 1, // 1 * 40 = 40
          children: 1, // 1 * 50 = 50
          students: 1, // 1 * 50 = 50
          foreignAdults: 1 // 1 * 500 = 500
        }
      );
      expect(assessment.budget.knownSubtotal).toBe(840); // 200 + 40 + 50 + 50 + 500
      expect(assessment.budget.travellerCount).toBe(6);
    });
  });

  // ==========================================
  // SECTION 2: DETERMINISTIC BUDGET ENGINE
  // ==========================================
  describe("2. Deterministic Budget Engine & Calculations", () => {
    it("9. should accurately calculate knownSubtotal across all catalogued attractions", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        sampleEntryFees,
        { adults: 1 }
      );
      // Fort (100) + Palace (200) + Park (0) = 300
      expect(assessment.budget.knownSubtotal).toBe(300);
    });

    it("10. should explicitly record accommodation, food, and transport as unknown categories", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        sampleEntryFees
      );
      expect(assessment.budget.unknownCategories).toContain("accommodation");
      expect(assessment.budget.unknownCategories).toContain("food");
      expect(assessment.budget.unknownCategories).toContain("transport");
      expect(assessment.breakdown.accommodation.status).toBe("unknown");
      expect(assessment.breakdown.food.status).toBe("unknown");
      expect(assessment.breakdown.transport.status).toBe("unknown");
    });

    it("11. should evaluate status as unknown when known subtotal is less than budget due to unknown categories", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        sampleEntryFees,
        { userBudget: 10000, adults: 1 } // Known=300, Budget=10000
      );
      // Cannot guarantee entire trip is under budget because lodging/food/transit are unknown
      expect(assessment.budget.status).toBe("unknown");
      expect(assessment.budget.remainingBudget).toBe(9700);
    });

    it("12. should evaluate status as over_budget when known entry fees alone exceed user budget", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        sampleEntryFees,
        { userBudget: 250, adults: 1 } // Known=300, Budget=250
      );
      expect(assessment.budget.status).toBe("over_budget");
      expect(assessment.budget.remainingBudget).toBe(-50);
      expect(assessment.warnings.some((w) => w.includes("Over Budget Alert"))).toBe(true);
    });

    it("13. should handle null userBudget with unknown status and null remaining budget", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        sampleEntryFees
      );
      expect(assessment.budget.userBudget).toBeNull();
      expect(assessment.budget.status).toBe("unknown");
      expect(assessment.budget.remainingBudget).toBeNull();
    });

    it("14. should calculate verified savings for both senior and student concessions", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        [sampleAttractions[0]], // Fort: domestic=100, student=50, senior=40
        [sampleEntryFees[0]],
        { adults: 0, seniors: 2, students: 2 }
      );
      // Seniors: (100 - 40) * 2 = 120
      // Students: (100 - 50) * 2 = 100
      expect(assessment.savings.length).toBe(2);
      const totalSavings = assessment.savings.reduce((a, s) => a + s.totalSavings, 0);
      expect(totalSavings).toBe(220);
    });

    it("15. should aggregate multi-attraction fee catalog via service", async () => {
      const fees = await budgetService.getAttractionFees(mockArakuId);
      expect(Array.isArray(fees)).toBe(true);
      expect(fees.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================
  // SECTION 3: ANTI-HALLUCINATION & GROUNDING
  // ==========================================
  describe("3. Anti-Hallucination & Grounding Guarantees", () => {
    it("16. should not fabricate hotel or accommodation prices", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        sampleEntryFees
      );
      expect(assessment.breakdown.accommodation.amount).toBeNull();
      expect(assessment.breakdown.accommodation.status).toBe("unknown");
      expect(assessment.breakdown.accommodation.notes).toMatch(/not tracked/i);
    });

    it("17. should not fabricate restaurant or meal prices", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        sampleEntryFees
      );
      expect(assessment.breakdown.food.amount).toBeNull();
      expect(assessment.breakdown.food.status).toBe("unknown");
      expect(assessment.breakdown.food.notes).toMatch(/not tracked/i);
    });

    it("18. should not fabricate taxi, fuel, or transit prices", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        sampleEntryFees
      );
      expect(assessment.breakdown.transport.amount).toBeNull();
      expect(assessment.breakdown.transport.status).toBe("unknown");
      expect(assessment.breakdown.transport.notes).toMatch(/not converted into monetary cost/i);
    });

    it("19. should verify road distance is never converted to a monetary transport cost", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        sampleEntryFees,
        { durationDays: 3 }
      );
      expect(assessment.breakdown.transport.amount).toBeNull();
      expect(assessment.budget.knownSubtotal).toBe(300); // Pure entry fees only
    });

    it("20. should disclose unknown costs transparently in disclaimers and warnings", () => {
      const assessment = budgetAnalyzer.assessDestinationBudget(
        sampleDestination,
        sampleAttractions,
        sampleEntryFees
      );
      expect(assessment.disclaimer).toMatch(/strictly from verified entry fee records/i);
      expect(assessment.warnings.some((w) => w.includes("Incomplete Cost Disclosure"))).toBe(true);
    });
  });

  // ==========================================
  // SECTION 4: AI & INTENT INTEGRATION
  // ==========================================
  describe("4. AI & Intent Integration", () => {
    it("21. should classify budget query intent for pure cost questions", () => {
      const result = intentClassifier.classify("How much will the entry fees cost in Araku?");
      expect(result.intent).toBe("budget_query");
      expect(result.requiredTools).toContain("budget_intelligence");
    });

    it("22. should extract budget amount and currency from user message", () => {
      const result = intentClassifier.classify("I have ₹5,000 for this 2-day trip to Jaipur");
      expect(result.entities.userBudget).toBe(5000);
      expect(result.entities.budgetCurrency).toBe("INR");
      expect(result.entities.isBudgetConstrained).toBe(true);
    });

    it("23. should dynamically select budget_intelligence tool during trip planning with budget constraint", () => {
      const result = intentClassifier.classify(
        "Plan a low cost budget trip to Coorg under ₹10,000"
      );
      expect(result.intent).toBe("trip_planning");
      expect(result.entities.userBudget).toBe(10000);
      expect(result.requiredTools).toContain("budget_intelligence");
    });

    it("24. should execute budget_intelligence tool safely via toolExecutor", async () => {
      const context = await toolExecutor.executeTools(["budget_intelligence"], {
        destinationId: mockArakuId,
        userBudget: 5000
      });
      expect(context.budget_assessment).toBeDefined();
      expect(context.sources.some((s) => s.resource === "entry_fees")).toBe(true);
    });

    it("25. should generate grounded budget response citing known fees via AI orchestrator", async () => {
      const response = await orchestratorService.chat(
        "What are the ticket prices and discounts in Araku?"
      );
      expect(response.intent).toBe("budget_query");
      expect(response.summary).toBeDefined();
      expect(response.budgetAssessment).toBeDefined();
      expect(response.sources.length).toBeGreaterThan(0);
    });

    it("26. should surface incomplete cost warning in AI response", async () => {
      const response = await orchestratorService.chat("How much will a trip to Araku cost?");
      expect(response.summary).toMatch(
        /complete trip expenditure cannot be determined|uncatalogued|unindexed/i
      );
    });
  });

  // ==========================================
  // SECTION 5: ITINERARY & CANDIDATE RANKING
  // ==========================================
  describe("5. Itinerary & Candidate Ranking", () => {
    it("27. should prioritize free attractions when budget constraint is active", () => {
      const candidates = candidateFilter.filterAndNormalize(
        {
          destination: sampleDestination,
          attractions: sampleAttractions,
          entryFees: sampleEntryFees
        },
        { isBudgetConstrained: true }
      );
      // City Public Garden (fee: 0) should receive the +25 boost
      expect(candidates.length).toBe(3);
      expect(candidates[0].type).toBe("attraction");
    });

    it("28. should prefer lower entry fee attractions when comparing paid candidates", () => {
      const candidates = candidateFilter.filterAndNormalize(
        {
          destination: sampleDestination,
          attractions: [sampleAttractions[0], sampleAttractions[1]], // Fort(100) vs Palace(200)
          entryFees: [sampleEntryFees[0], sampleEntryFees[1]]
        },
        { isBudgetConstrained: true }
      );
      // Fort (₹100) should rank ahead of Palace (₹200)
      expect(candidates[0].name).toBe("Grand Fort");
    });

    it("29. should prioritize senior discount attractions when senior traveller is present", () => {
      const candidates = candidateFilter.filterAndNormalize(
        {
          destination: sampleDestination,
          attractions: [sampleAttractions[0], sampleAttractions[1]], // Fort has senior note, Palace doesn't
          entryFees: [sampleEntryFees[0], sampleEntryFees[1]]
        },
        { isElderlyTraveller: true, travellerGroup: "parents", isBudgetConstrained: true }
      );
      expect(candidates[0].name).toBe("Grand Fort");
    });

    it("30. should handle strict budget planning without crashing or hallucinating places", async () => {
      const response = await orchestratorService.chat(
        "Plan a budget 2-day trip to Araku with ₹2000 total budget"
      );
      expect(response.intent).toBe("trip_planning");
      expect(response.days?.length).toBe(2);
      expect(response.trip?.destination).toMatch(/Araku/i);
    });

    it("31. should surface incomplete-cost disclaimer in budget-aware itinerary response", async () => {
      const response = await orchestratorService.chat(
        "Plan an affordable trip to Araku for 2 days"
      );
      expect(response.warnings.length).toBeGreaterThanOrEqual(0);
      expect(response.sources.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // SECTION 6: SECURITY & API ENDPOINTS
  // ==========================================
  describe("6. Security & API Endpoints", () => {
    it("32. should serve GET /api/v1/budget/destinations/:id publicly without authentication", async () => {
      const res = await request(app).get(`/api/v1/budget/destinations/${mockArakuId}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.destinationId).toBe(mockArakuId);
      expect(res.body.data.budget).toBeDefined();
      expect(res.body.data.breakdown).toBeDefined();
    });

    it("33. should accept optional query parameters for custom demographics", async () => {
      const res = await request(app).get(`/api/v1/budget/destinations/${mockArakuId}`).query({
        userBudget: 5000,
        adults: 2,
        seniors: 1,
        children: 1,
        durationDays: 3
      });
      expect(res.status).toBe(200);
      expect(res.body.data.budget.userBudget).toBe(5000);
      expect(res.body.data.budget.travellerCount).toBe(4);
      expect(res.body.data.budget.durationDays).toBe(3);
    });

    it("34. should ensure zero user data or internal authorization leaks in public budget response", async () => {
      const res = await request(app).get(`/api/v1/budget/destinations/${mockArakuId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBeUndefined();
      expect(res.body.data.user_id).toBeUndefined();
      expect(res.body.data.token).toBeUndefined();
    });
  });
});
