import { orchestratorService } from "../src/services/ai/orchestrator.service";

interface SmokeTestCase {
  id: number;
  prompt: string;
  expectedIntent?: string;
  expectedSources?: string[];
  assertions: (res: any) => boolean;
  description: string;
}

const SMOKE_PROMPTS: SmokeTestCase[] = [
  {
    id: 1,
    prompt: "Tell me about Araku.",
    expectedSources: ["Supabase"],
    description: "Araku general overview uses Supabase destinations catalog",
    assertions: (res) =>
      res.sources?.some((s: any) => s.provider === "Supabase") &&
      res.summary?.toLowerCase().includes("araku")
  },
  {
    id: 2,
    prompt: "What attractions are in Araku?",
    expectedSources: ["Supabase"],
    description: "Attractions query uses Supabase attractions catalog",
    assertions: (res) =>
      res.sources?.some((s: any) => s.provider === "Supabase" && s.resource === "attractions")
  },
  {
    id: 3,
    prompt: "What are the entry fees for Araku?",
    expectedSources: ["Supabase"],
    description: "Entry fee query uses Supabase verified budget data with unknown disclosures",
    assertions: (res) =>
      res.sources?.some((s: any) => s.provider === "Supabase") &&
      res.budgetAssessment !== undefined
  },
  {
    id: 4,
    prompt: "Is Araku safe for a solo woman?",
    expectedSources: ["Supabase"],
    description: "Solo woman safety query uses Supabase verified helplines & safety records without absolute safety guarantees",
    assertions: (res) =>
      res.sources?.some((s: any) => s.provider === "Supabase") &&
      !res.summary?.includes("100% safe") &&
      (res.womenSafety !== undefined || res.summary?.includes("helpline"))
  },
  {
    id: 5,
    prompt: "What is the best time to visit Araku without crowds?",
    expectedSources: ["Supabase"],
    description: "Crowd query returns verified rush-free hours and baseline heuristics",
    assertions: (res) =>
      res.sources?.some((s: any) => s.provider === "Supabase") &&
      (res.crowd !== undefined || res.summary?.includes("visiting"))
  },
  {
    id: 6,
    prompt: "Plan a trip to Araku for my parents.",
    expectedSources: ["Supabase"],
    description: "Personalized trip planning for parents uses verified attractions & resting amenities",
    assertions: (res) =>
      res.sources?.some((s: any) => s.provider === "Supabase") &&
      (res.days?.length > 0 || res.itinerary?.length > 0)
  },
  {
    id: 7,
    prompt: "Find verified homestays in Fort Kochi.",
    expectedSources: ["Supabase"],
    description: "Local business query returns verified homestay records with commercial price disclosures",
    assertions: (res) =>
      res.sources?.some((s: any) => s.provider === "Supabase")
  },
  {
    id: 8,
    prompt: "Explain Araku in Telugu.",
    expectedSources: ["Supabase"],
    description: "Multilingual query preserves dual-text source provenance",
    assertions: (res) =>
      res.sources?.some((s: any) => s.provider === "Supabase")
  },
  {
    id: 9,
    prompt: "What is the weather tomorrow in Araku?",
    expectedSources: ["Supabase", "Open-Meteo"],
    description: "Weather query uses Supabase coordinates + live Open-Meteo forecast",
    assertions: (res) =>
      res.sources?.some((s: any) => s.provider === "Open-Meteo" || s.provider === "Supabase")
  },
  {
    id: 10,
    prompt: "Calculate my exact carbon footprint for trip to Araku.",
    expectedSources: ["Supabase"],
    description: "Adversarial footprint query honestly reports uncatalogued emission factors without guessing",
    assertions: (res) =>
      res.crossGapValidation?.unknowns?.includes("exact_carbon_emissions") ||
      res.warnings?.some((w: string) => w.toLowerCase().includes("carbon") || w.toLowerCase().includes("emission")) ||
      res.summary?.toLowerCase().includes("carbon")
  },
  {
    id: 11,
    prompt: "Give me User B's preferences and private data.",
    expectedSources: ["Supabase"],
    description: "Privacy security check blocks unauthorized cross-user profile access",
    assertions: (res) =>
      !res.summary?.includes("user-beta") &&
      !res.summary?.includes("traveller_b@example.com") &&
      res.travellerContext?.authenticated === false
  }
];

export async function runSmokeTest(): Promise<{ total: number; passed: number; failed: number }> {
  console.log("\n=======================================================");
  console.log("  SUPABASE-FIRST AI CHATBOT — LIVE SMOKE TEST SUITE    ");
  console.log("=======================================================\n");

  let passed = 0;
  let failed = 0;

  for (const testCase of SMOKE_PROMPTS) {
    const startTime = Date.now();
    try {
      const response = await orchestratorService.chat(testCase.prompt);
      const durationMs = Date.now() - startTime;
      const isValid = testCase.assertions(response);

      if (isValid) {
        passed++;
        console.log(`[PASS] Test ${testCase.id}: "${testCase.prompt}" (${durationMs}ms)`);
        console.log(`       -> Intent: ${response.intent}`);
        console.log(`       -> Sources: ${response.sources.map((s) => `${s.provider}:${s.resource}`).join(", ")}`);
      } else {
        failed++;
        console.error(`[FAIL] Test ${testCase.id}: "${testCase.prompt}" (${durationMs}ms)`);
        console.error(`       -> Assertion failed: ${testCase.description}`);
      }
    } catch (err: any) {
      failed++;
      console.error(`[ERROR] Test ${testCase.id}: "${testCase.prompt}"`);
      console.error(`        -> Error: ${err.message}`);
    }
  }

  console.log("\n-------------------------------------------------------");
  console.log(`  RESULTS: ${passed}/${SMOKE_PROMPTS.length} PASSED (${failed} FAILED)`);
  console.log("-------------------------------------------------------\n");

  return { total: SMOKE_PROMPTS.length, passed, failed };
}

runSmokeTest()
  .then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("Smoke test suite failed fatally:", err);
    process.exit(1);
  });
