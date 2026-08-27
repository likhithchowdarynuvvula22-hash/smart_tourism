import { describe, it, expect } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { createApp } from "../src/app";

describe("Phase 7E: Crowd, Accessibility & Local Experiences Frontend Grounding Suite", () => {
  const app = createApp();
  const frontendIndexPath = path.resolve(__dirname, "../frontend/index.html");
  const htmlContent = fs.readFileSync(frontendIndexPath, "utf-8");

  // Real database verified UUIDs
  const testDestinations = {
    arakuValley: "01e98249-049a-4017-a5fb-98b913e05ca5",
    fortKochi: "324f8a6f-d7cc-4efa-bf38-358726b84a4d",
    hampi: "c553f717-e470-4a37-9136-795106648883",
    hussainSagar: "51aa2b75-f416-4d09-9af7-8dfb617f6aee",
    madikeri: "d1523e30-0799-47d5-ae08-cba85e051d24",
    marariBeach: "a2b4e3b9-0d78-4b13-9432-1d086d2c100e"
  };

  // ---------------------------------------------------------------------------
  // 1. Static Anti-Hallucination & Hardcoding Removal Invariants
  // ---------------------------------------------------------------------------
  describe("1. Static Anti-Hallucination & Hardcoding Removal Invariants", () => {
    it("should NOT contain hardcoded static crowd peak rush / quiet hours ('06:30 AM', '1.8x Baseline')", () => {
      expect(htmlContent).not.toMatch(/1\.8x\s+Baseline/i);
      expect(htmlContent).not.toMatch(/06:30\s*AM\s*-\s*09:00\s*AM/i);
      expect(htmlContent).not.toMatch(/03:30\s*PM\s*-\s*06:00\s*PM/i);
    });

    it("should NOT contain fabricated hourly footfall percentages (20%, 55%, 65%, 95%) in crowd page", () => {
      expect(htmlContent).not.toMatch(/h-\[20%\]/);
      expect(htmlContent).not.toMatch(/h-\[55%\]/);
      expect(htmlContent).not.toMatch(/h-\[65%\]/);
      expect(htmlContent).not.toMatch(/h-\[95%\]/);
      expect(htmlContent).toContain("Hourly footfall observations are not currently available.");
    });

    it("should NOT contain hardcoded accessibility facility claims ('resting bench intervals every 150m', 'minimal uphill walking routes')", () => {
      expect(htmlContent).not.toContain("resting bench intervals every 150m");
      expect(htmlContent).not.toContain("minimal uphill walking routes");
      expect(htmlContent).not.toContain("low decibel quiet courtyards");
    });

    it("should display 'Information not currently indexed.' for unindexed accessibility facilities", () => {
      expect(htmlContent).toContain(
        "Tactile braille &amp; audio guides: Information not currently indexed."
      );
      expect(htmlContent).toContain(
        "Resting areas: ${hasRestingAreas ? 'Verified' : 'Information not currently indexed.'}"
      );
    });

    it("should NOT contain fake experience cards ('Traditional Terracotta & Pottery', 'Royal Spice & Street Flavors Walk', 'Silk & Cotton Loom Workshop')", () => {
      expect(htmlContent).not.toContain("Traditional Terracotta & Pottery");
      expect(htmlContent).not.toContain("Royal Spice & Street Flavors Walk");
      expect(htmlContent).not.toContain("Silk & Cotton Loom Workshop");
    });

    it("should contain standard empty-state message when 0 experiences are indexed", () => {
      expect(htmlContent).toContain(
        "No verified local experiences are currently indexed for this destination."
      );
    });

    it("should NOT hardcode destination options inside crowd, accessibility, and experiences selectors", () => {
      const crowdSelect =
        htmlContent.match(/<select id="crowdDestinationSelect"[\s\S]*?<\/select>/)?.[0] || "";
      expect(crowdSelect).not.toContain("<option");
      const accessSelect =
        htmlContent.match(/<select id="accessDestinationSelect"[\s\S]*?<\/select>/)?.[0] || "";
      expect(accessSelect).not.toContain("<option");
      const expSelect =
        htmlContent.match(/<select id="expDestinationSelect"[\s\S]*?<\/select>/)?.[0] || "";
      expect(expSelect).not.toContain("<option");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Dynamic Controls & State Management Invariants
  // ---------------------------------------------------------------------------
  describe("2. Dynamic Controls & State Management Invariants", () => {
    it("should have search, state filter, and destination selectors for Crowd Forecaster", () => {
      expect(htmlContent).toContain('id="crowdSearchInput"');
      expect(htmlContent).toContain('oninput="handleCrowdSearchInput(this.value)"');
      expect(htmlContent).toContain('id="crowdStateSelect"');
      expect(htmlContent).toContain('onchange="handleCrowdStateChange(this.value)"');
      expect(htmlContent).toContain('id="crowdDestinationSelect"');
      expect(htmlContent).toContain('onchange="handleCrowdDestinationSelection(this.value)"');
      expect(htmlContent).toContain('id="crowdCatalogCountBadge"');
    });

    it("should have search, state filter, and destination selectors for Accessibility Hub", () => {
      expect(htmlContent).toContain('id="accessSearchInput"');
      expect(htmlContent).toContain('oninput="handleAccessSearchInput(this.value)"');
      expect(htmlContent).toContain('id="accessStateSelect"');
      expect(htmlContent).toContain('onchange="handleAccessStateChange(this.value)"');
      expect(htmlContent).toContain('id="accessDestinationSelect"');
      expect(htmlContent).toContain('onchange="handleAccessDestinationSelection(this.value)"');
      expect(htmlContent).toContain('id="accessCatalogCountBadge"');
    });

    it("should have search, state filter, category filter, and destination selectors for Local Experiences", () => {
      expect(htmlContent).toContain('id="expSearchInput"');
      expect(htmlContent).toContain('oninput="handleExpSearchInput(this.value)"');
      expect(htmlContent).toContain('id="expStateSelect"');
      expect(htmlContent).toContain('onchange="handleExpStateChange(this.value)"');
      expect(htmlContent).toContain('id="expDestinationSelect"');
      expect(htmlContent).toContain('onchange="handleExpDestinationSelection(this.value)"');
      expect(htmlContent).toContain('id="expCatalogCountBadge"');
      expect(htmlContent).toContain("handleExpCategoryFilter");
    });

    it("should maintain cache objects in AppState for crowd, accessibility, and experiences", () => {
      expect(htmlContent).toContain("crowdCache: {}");
      expect(htmlContent).toContain("accessCache: {}");
      expect(htmlContent).toContain("expCache: {}");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Crowd Forecaster API Grounding & Live Endpoint Tests
  // ---------------------------------------------------------------------------
  describe("3. Crowd Forecaster API Grounding", () => {
    it("should fetch real crowd intelligence using UUID for Araku Valley", async () => {
      const res = await request(app).get(
        `/api/v1/crowd/destinations/${testDestinations.arakuValley}`
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationId).toBe(testDestinations.arakuValley);
      expect(res.body.data.destinationName).toBe("Araku Valley");
      expect(res.body.data.crowd).toBeDefined();
      expect(res.body.data.crowd.level).toBeDefined();
      expect(res.body.data.dataQuality).toBeDefined();
      expect(Array.isArray(res.body.data.sources)).toBe(true);
    });

    it("should fetch real crowd intelligence using UUID for Hampi", async () => {
      const res = await request(app).get(`/api/v1/crowd/destinations/${testDestinations.hampi}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationId).toBe(testDestinations.hampi);
      expect(res.body.data.destinationName).toBe("Hampi Ruins");
      expect(res.body.data.crowd).toBeDefined();
    });

    it("should return 404/400 for an invalid crowd destination UUID", async () => {
      const res = await request(app).get(
        "/api/v1/crowd/destinations/00000000-0000-0000-0000-000000000000"
      );
      expect([400, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Accessibility Hub API Grounding & Live Endpoint Tests
  // ---------------------------------------------------------------------------
  describe("4. Accessibility Hub API Grounding", () => {
    it("should fetch real accessibility intelligence using UUID for Araku Valley", async () => {
      const res = await request(app).get(
        `/api/v1/accessibility/destinations/${testDestinations.arakuValley}`
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationId).toBe(testDestinations.arakuValley);
      expect(res.body.data.destinationName).toBe("Araku Valley");
      expect(res.body.data.accessibilityStatus).toBeDefined();
      expect(res.body.data.dataQuality).toBeDefined();
      expect(Array.isArray(res.body.data.sources)).toBe(true);
    });

    it("should fetch real accessibility intelligence using UUID for Fort Kochi", async () => {
      const res = await request(app).get(
        `/api/v1/accessibility/destinations/${testDestinations.fortKochi}`
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationId).toBe(testDestinations.fortKochi);
      expect(res.body.data.destinationName).toBe("Fort Kochi");
    });

    it("should return 404/400 for an invalid accessibility destination UUID", async () => {
      const res = await request(app).get(
        "/api/v1/accessibility/destinations/00000000-0000-0000-0000-000000000000"
      );
      expect([400, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Local Experiences API Grounding & Live Endpoint Tests
  // ---------------------------------------------------------------------------
  describe("5. Local Experiences API Grounding", () => {
    it("should fetch real local experiences using UUID for Araku Valley", async () => {
      const res = await request(app).get(
        `/api/v1/experiences/destinations/${testDestinations.arakuValley}`
      );
      expect(res.status).toBe(200);
      expect(res.body.data.destinationId).toBe(testDestinations.arakuValley);
      expect(res.body.data.destinationName).toBe("Araku Valley");
      expect(Array.isArray(res.body.data.rankedItems)).toBe(true);
      expect(res.body.data.dataQuality).toBeDefined();
      expect(Array.isArray(res.body.data.sources)).toBe(true);
    });

    it("should fetch real local experiences using UUID for Marari Beach", async () => {
      const res = await request(app).get(
        `/api/v1/experiences/destinations/${testDestinations.marariBeach}`
      );
      expect(res.status).toBe(200);
      expect(res.body.data.destinationId).toBe(testDestinations.marariBeach);
      expect(res.body.data.destinationName).toBe("Marari Beach");
      expect(Array.isArray(res.body.data.rankedItems)).toBe(true);
    });

    it("should fetch real local experiences using UUID for Madikeri", async () => {
      const res = await request(app).get(
        `/api/v1/experiences/destinations/${testDestinations.madikeri}`
      );
      expect(res.status).toBe(200);
      expect(res.body.data.destinationId).toBe(testDestinations.madikeri);
      expect(res.body.data.destinationName).toBe("Madikeri");
      expect(Array.isArray(res.body.data.rankedItems)).toBe(true);
    });

    it("should fetch real local experiences using UUID for Hussain Sagar Lake", async () => {
      const res = await request(app).get(
        `/api/v1/experiences/destinations/${testDestinations.hussainSagar}`
      );
      expect(res.status).toBe(200);
      expect(res.body.data.destinationId).toBe(testDestinations.hussainSagar);
      expect(res.body.data.destinationName).toBe("Hussain Sagar Lake & Buddha");
      expect(Array.isArray(res.body.data.rankedItems)).toBe(true);
    });

    it("should return 404/400 for an invalid experiences destination UUID", async () => {
      const res = await request(app).get(
        "/api/v1/experiences/destinations/00000000-0000-0000-0000-000000000000"
      );
      expect([400, 404]).toContain(res.status);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. UI & Template Consistency
  // ---------------------------------------------------------------------------
  describe("6. UI & Template Consistency", () => {
    it("should provide loading, error, and result containers for all three pages", () => {
      expect(htmlContent).toContain('id="crowdLoadingState"');
      expect(htmlContent).toContain('id="crowdErrorState"');
      expect(htmlContent).toContain('id="crowdResultPanel"');

      expect(htmlContent).toContain('id="accessLoadingState"');
      expect(htmlContent).toContain('id="accessErrorState"');
      expect(htmlContent).toContain('id="accessResultPanel"');

      expect(htmlContent).toContain('id="expLoadingState"');
      expect(htmlContent).toContain('id="expErrorState"');
      expect(htmlContent).toContain('id="expResultPanel"');
    });

    it("should include disclaimers and source attributions in all three page renders", () => {
      expect(htmlContent).toContain("Baseline Estimation Rationale");
      expect(htmlContent).toContain("Verified Accessibility Feature Matrix");
      expect(htmlContent).toContain("Regional Linguistic &amp; Cultural Context");
    });
  });
});
