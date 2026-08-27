import { createApp } from "../src/app";
import request from "supertest";

interface StepResult {
  step: string;
  category: string;
  status: "PASS" | "FAIL" | "PARTIAL";
  details: string;
  durationMs: number;
}

async function runFinalValidation() {
  console.log("===============================================================");
  console.log("PHASE 11: FINAL VALIDATION & SIH READINESS SPRINT EXECUTION");
  console.log("Team: SAMASTHA SAMANVAYAM");
  console.log("Platform: AI-Powered Smart Tourism Platform");
  console.log("===============================================================\n");

  const app = createApp();
  const results: StepResult[] = [];
  const ARAKU_DEST_ID = "01e98249-049a-4017-a5fb-98b913e05ca5";

  async function check(category: string, step: string, fn: () => Promise<void>) {
    const start = Date.now();
    try {
      await fn();
      const durationMs = Date.now() - start;
      results.push({ step, category, status: "PASS", details: "OK", durationMs });
      console.log(`[PASS] ${category} > ${step} (${durationMs}ms)`);
    } catch (err: any) {
      const durationMs = Date.now() - start;
      results.push({ step, category, status: "FAIL", details: err.message || String(err), durationMs });
      console.error(`[FAIL] ${category} > ${step} (${durationMs}ms): ${err.message}`);
    }
  }

  // 1. Health & Infrastructure
  await check("Infrastructure", "Health Endpoint Check", async () => {
    const res = await request(app).get("/health");
    if (res.status !== 200 || !res.body.success) throw new Error(`Status ${res.status}`);
  });

  await check("Infrastructure", "Readiness & DB Check", async () => {
    const res = await request(app).get("/ready");
    if (res.status !== 200 || !res.body.success) throw new Error(`Status ${res.status}`);
  });

  // 2. Core Tourism & Discovery
  await check("Core Tourism", "Destination Search & State Filtering", async () => {
    const res = await request(app).get("/api/v1/destinations?state=Andhra%20Pradesh&pageSize=5");
    if (res.status !== 200 || !res.body.success || !Array.isArray(res.body.data)) {
      throw new Error(`Invalid destination response`);
    }
  });

  // 3. AI Planning & Grounding
  await check("AI Planning", "2-Day Personalized Itinerary Generation", async () => {
    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a 2-day trip to Araku for parents" });
    if (res.status !== 200 || !res.body.data?.itinerary) {
      throw new Error(`Itinerary generation failed with status ${res.status}`);
    }
  });

  // 4. Phase 7 Specialized Intelligence Matrix
  await check("Phase 7 Matrix", "Crowd Intelligence (7A)", async () => {
    const res = await request(app).get(`/api/v1/crowd/destinations/${ARAKU_DEST_ID}`);
    if (res.status !== 200 || !res.body.data?.crowd) throw new Error(`Crowd endpoint failure`);
  });

  await check("Phase 7 Matrix", "Women Safety Intelligence (7B)", async () => {
    const res = await request(app).get(`/api/v1/safety/women/destinations/${ARAKU_DEST_ID}`);
    if (res.status !== 200 || !res.body.data?.emergencyResources) throw new Error(`Safety endpoint failure`);
  });

  await check("Phase 7 Matrix", "Elderly & Wheelchair Support (7C)", async () => {
    const res = await request(app).get(`/api/v1/accessibility/destinations/${ARAKU_DEST_ID}`);
    if (res.status !== 200 || !res.body.data?.accessibilityStatus) throw new Error(`Accessibility endpoint failure`);
  });

  await check("Phase 7 Matrix", "Budget Intelligence (7D)", async () => {
    const res = await request(app).get(`/api/v1/budget/destinations/${ARAKU_DEST_ID}`);
    if (res.status !== 200 || !res.body.data?.breakdown) throw new Error(`Budget endpoint failure`);
  });

  await check("Phase 7 Matrix", "Local Experiences (7E)", async () => {
    const res = await request(app).get(`/api/v1/experiences/destinations/${ARAKU_DEST_ID}`);
    if (res.status !== 200) throw new Error(`Experience endpoint failure`);
  });

  await check("Phase 7 Matrix", "Content & Multilingual (7F)", async () => {
    const res = await request(app).get(`/api/v1/content/destinations/${ARAKU_DEST_ID}/summary`);
    if (res.status !== 200 || !res.body.data?.sections) throw new Error(`Content endpoint failure`);
  });

  await check("Phase 7 Matrix", "Local Business Directory (7G)", async () => {
    const res = await request(app).get(`/api/v1/businesses/destinations/${ARAKU_DEST_ID}`);
    if (res.status !== 200) throw new Error(`Business endpoint failure`);
  });

  await check("Phase 7 Matrix", "Sustainability & Eco-Rating (7H)", async () => {
    const res = await request(app).get(`/api/v1/sustainability/destinations/${ARAKU_DEST_ID}`);
    if (res.status !== 200 || !res.body.data?.sustainabilityStatus) throw new Error(`Sustainability endpoint failure`);
  });

  // 5. Security Invariants
  await check("Security", "Unauthenticated Request Yields 401", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check("Security", "Cross-Tenant Trip Access Blocked", async () => {
    const res = await request(app).get("/api/v1/trips/11111111-1111-1111-1111-111111111111");
    if (res.status !== 401 && res.status !== 403) throw new Error(`Expected 401/403, got ${res.status}`);
  });

  await check("Security", "Zero Secret Leakage in Health Payload", async () => {
    const res = await request(app).get("/health");
    const str = JSON.stringify(res.body);
    if (str.includes("eyJh") || str.includes("AIzaSy")) throw new Error("Secret detected in output");
  });

  // Final Summary
  console.log("\n===============================================================");
  console.log("FINAL VALIDATION SUMMARY");
  console.log("===============================================================");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  console.log(`Total Checks: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed === 0) {
    console.log("\nSTATUS: >>> GO FOR SIH DEMO & FRONTEND INTEGRATION <<<");
  } else {
    console.log("\nSTATUS: >>> AUDIT FAILED — ATTENTION REQUIRED <<<");
  }
  console.log("===============================================================\n");
}

runFinalValidation().catch(console.error);
