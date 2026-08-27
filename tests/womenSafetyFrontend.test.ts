import { describe, it, expect } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { createApp } from "../src/app";

describe("Phase 7B: Women Safety Frontend Grounding & Destination Coverage Suite", () => {
  const app = createApp();
  const frontendIndexPath = path.resolve(__dirname, "../frontend/index.html");
  const htmlContent = fs.readFileSync(frontendIndexPath, "utf-8");

  // ---------------------------------------------------------------------------
  // 1. Static Anti-Hallucination & Hardcoding Removal Invariants
  // ---------------------------------------------------------------------------
  describe("1. Static Anti-Hallucination & Hardcoding Removal Invariants", () => {
    it("13. should NOT contain hardcoded 8.8 / 10 safety score anywhere in index.html", () => {
      expect(htmlContent).not.toMatch(/8\.8\s*\/\s*10/i);
      expect(htmlContent).not.toMatch(/Safety\s+8\.8/i);
      expect(htmlContent).not.toMatch(/8\.8\/10/i);
    });

    it("14. should NOT contain hardcoded 'Verified Safe' or 'High Security' anywhere in index.html", () => {
      expect(htmlContent).not.toMatch(/\bVerified\s+Safe\b/i);
      expect(htmlContent).not.toMatch(/\bHigh\s+Security\b/i);
    });

    it("15. should NOT contain hardcoded lighting claim ('Well-lit near Main Promenade')", () => {
      expect(htmlContent).not.toContain("Well-lit near Main Promenade");
      expect(htmlContent).toContain(
        "Destination-specific lighting information is not currently indexed."
      );
    });

    it("should NOT hardcode fixed destination options inside safety destination selector HTML", () => {
      // The select element in HTML should be empty and populated dynamically by JavaScript
      const safetySelect =
        htmlContent.match(/<select id="safetyDestinationSelect"[\s\S]*?<\/select>/)?.[0] || "";
      expect(safetySelect).not.toContain("<option");
      expect(htmlContent).toContain('id="safetyDestinationSelect"');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Complete Destination Catalog & API Integration
  // ---------------------------------------------------------------------------
  describe("2. Destination Catalog & Dynamic Loading", () => {
    it("1. should serve complete destination catalog through GET /api/v1/destinations with total > 600", async () => {
      const res = await request(app).get("/api/v1/destinations?pageSize=100&page=1");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pagination.total).toBeGreaterThan(600);
      expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(7);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(100);
    });

    it("2. should include multi-page fetching logic in loadDestinationsCatalog to load all catalog pages", () => {
      expect(htmlContent).toContain("loadDestinationsCatalog");
      expect(htmlContent).toContain("pageSize=100&page=1");
      expect(htmlContent).toContain("pagination?.totalPages");
      expect(htmlContent).toContain("Promise.all(pagePromises)");
      expect(htmlContent).toContain("AppState.totalDestinationsCount = total;");
    });

    it("3. should provide dynamic destination search input and state filter controls in UI", () => {
      expect(htmlContent).toContain('id="safetySearchInput"');
      expect(htmlContent).toContain('oninput="handleSafetySearchInput(this.value)"');
      expect(htmlContent).toContain('id="safetyStateSelect"');
      expect(htmlContent).toContain('onchange="handleSafetyStateChange(this.value)"');
      expect(htmlContent).toContain('id="safetyCatalogCountBadge"');
    });

    it("4. should populate safety state dropdown from dynamic database states", async () => {
      const res = await request(app).get("/api/v1/destinations/states");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(20);

      // Verify JavaScript populates safetyStateSelect
      expect(htmlContent).toContain(
        "const safetySelect = document.getElementById('safetyStateSelect');"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Selected Destination UUID & Safety API Grounding
  // ---------------------------------------------------------------------------
  describe("3. Safety API Grounding & UUID Usage", () => {
    it("5. & 6. should fetch real safety intelligence using destination UUID from GET /api/v1/safety/women/destinations/:id", async () => {
      // Araku Valley UUID
      const arakuId = "01e98249-049a-4017-a5fb-98b913e05ca5";
      const res = await request(app).get(`/api/v1/safety/women/destinations/${arakuId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationId).toBe(arakuId);
      expect(res.body.data.destinationName).toBe("Araku Valley");

      // Verify frontend calls the UUID route with encodeURIComponent
      expect(htmlContent).toContain(
        "fetch(`/api/v1/safety/women/destinations/${encodeURIComponent(destId)}`)"
      );
    });

    it("7. should have null sourceBackedScore for Araku Valley and render 'Not Available'", async () => {
      const arakuId = "01e98249-049a-4017-a5fb-98b913e05ca5";
      const res = await request(app).get(`/api/v1/safety/women/destinations/${arakuId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.sourceBackedScore).toBeNull();

      // Verify frontend renders "Not Available" when sourceBackedScore is null
      expect(htmlContent).toContain(
        "assessment.sourceBackedScore && assessment.sourceBackedScore.score != null"
      );
      expect(htmlContent).toContain("'Not Available'");
      expect(htmlContent).toContain("No verified numeric safety score is currently available.");
    });

    it("8. should return 'unknown' riskLevel for Araku Valley and display 'Unknown'", async () => {
      const arakuId = "01e98249-049a-4017-a5fb-98b913e05ca5";
      const res = await request(app).get(`/api/v1/safety/women/destinations/${arakuId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.riskLevel).toBe("unknown");

      // Verify frontend treats unknown as "Unknown" with explanatory disclaimer
      expect(htmlContent).toContain("let riskTitle = 'Unknown';");
      expect(htmlContent).toContain(
        "Destination-specific safety indicators are limited or unindexed. Absence of data does NOT imply safety or danger."
      );
    });

    it("9. should return 'limited' dataQuality for Araku Valley and display 'Limited Data'", async () => {
      const arakuId = "01e98249-049a-4017-a5fb-98b913e05ca5";
      const res = await request(app).get(`/api/v1/safety/women/destinations/${arakuId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.dataQuality.status).toBe("limited");

      // Verify frontend renders Limited Data badge
      expect(htmlContent).toContain("qualityTitle = 'Limited Data';");
      expect(htmlContent).toContain("Limited destination-specific safety data");
    });

    it("10. & 11. should preserve empty incidents and alerts without converting to 'Verified Safe'", async () => {
      const arakuId = "01e98249-049a-4017-a5fb-98b913e05ca5";
      const res = await request(app).get(`/api/v1/safety/women/destinations/${arakuId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.alerts).toEqual([]);
      expect(res.body.data.incidents).toEqual([]);

      // Verify frontend explicitly discloses absence of incidents does not guarantee safety
      expect(htmlContent).toContain(
        "Verified active alerts: None recorded in the current dataset."
      );
      expect(htmlContent).toContain(
        "Recorded safety incidents: None recorded in the current dataset."
      );
      expect(htmlContent).toContain(
        "Absence of reported incidents does not guarantee universal safety."
      );
    });

    it("12. should display 'Not currently indexed' when womenPolice contact is null", async () => {
      const arakuId = "01e98249-049a-4017-a5fb-98b913e05ca5";
      const res = await request(app).get(`/api/v1/safety/women/destinations/${arakuId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.womenSafetyIndicators.womenPolice).toBeNull();

      // Verify frontend displays unindexed notice
      expect(htmlContent).toContain(
        "Destination-specific women police contact: Not currently indexed"
      );
      expect(htmlContent).toContain(
        "Destination-specific women support center: Not currently indexed"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. UI States, Performance & Chatbot Consistency
  // ---------------------------------------------------------------------------
  describe("4. UI States, Performance & System Consistency", () => {
    it("16. & 17. should contain dedicated loading and error state elements", () => {
      expect(htmlContent).toContain('id="safetyLoadingState"');
      expect(htmlContent).toContain('id="safetyErrorState"');
      expect(htmlContent).toContain('id="safetyErrorMessage"');
      expect(htmlContent).toContain('id="safetyResultPanel"');
    });

    it("18. should support responsive selector across desktop and mobile", () => {
      expect(htmlContent).toContain(
        'class="flex-1 bg-surface-low border border-white/15 rounded-xl px-4 py-2.5 text-xs md:text-sm text-on-surface'
      );
      expect(htmlContent).toContain('class="grid grid-cols-1 md:grid-cols-12 gap-3 mb-6"');
    });

    it("19. should maintain dark theme classes across all safety containers", () => {
      expect(htmlContent).toContain("glass-card rounded-2xl p-6 mb-8 border border-white/10");
      expect(htmlContent).toContain("bg-surface-low border border-white/10");
    });

    it("20. should produce consistent safety intelligence between safety page and AI chatbot endpoint", async () => {
      const arakuId = "01e98249-049a-4017-a5fb-98b913e05ca5";
      const [safetyRes, chatRes] = await Promise.all([
        request(app).get(`/api/v1/safety/women/destinations/${arakuId}`),
        request(app).post("/api/v1/ai/chat").send({ message: "Is Araku safe for a solo woman?" })
      ]);

      expect(safetyRes.status).toBe(200);
      expect(chatRes.status).toBe(200);

      // Both endpoints agree that Araku has unknown risk and limited indicators without fabricating high security
      expect(safetyRes.body.data.riskLevel).toBe("unknown");
      expect(chatRes.body.data.summary).not.toContain("High Security");
      expect(chatRes.body.data.summary).not.toContain("Verified Safe");
      expect(chatRes.body.data.days).toEqual([]);
    });
  });
});
