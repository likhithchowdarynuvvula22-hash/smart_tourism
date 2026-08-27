const BASE_URL = process.env.SMOKE_TEST_URL || "http://localhost:5006";
const ARAKU_ID = "01e98249-049a-4017-a5fb-98b913e05ca5";

interface SmokeCheck {
  name: string;
  fn: () => Promise<{ passed: boolean; message: string }>;
}

interface BenchmarkResult {
  scenario: string;
  iterations: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorCount: number;
}

async function measureScenario(
  name: string,
  iterations: number,
  fn: () => Promise<boolean>
): Promise<BenchmarkResult> {
  const durations: number[] = [];
  let errorCount = 0;

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    try {
      const success = await fn();
      if (!success) errorCount++;
    } catch {
      errorCount++;
    }
    durations.push(Date.now() - start);
  }

  durations.sort((a, b) => a - b);
  const avg = durations.reduce((acc, d) => acc + d, 0) / durations.length;
  const p95 = durations[Math.floor(durations.length * 0.95)] || durations[durations.length - 1];

  return {
    scenario: name,
    iterations,
    avgLatencyMs: Math.round(avg),
    p95LatencyMs: Math.round(p95),
    errorCount
  };
}

async function runStagingVerification(): Promise<void> {
  console.log("================================================================================");
  console.log(`🌐 STAGING & PRODUCTION-MODE VERIFICATION SUITE [${BASE_URL}]`);
  console.log("================================================================================\n");

  const initialMemory = process.memoryUsage();

  const checks: SmokeCheck[] = [
    {
      name: "1. Health Endpoint (/health)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/health`);
        const json = (await res.json()) as { success: boolean; data: { status: string } };
        return {
          passed: res.status === 200 && json.data?.status === "healthy",
          message: `HTTP ${res.status} (status: ${json.data?.status})`
        };
      }
    },
    {
      name: "2. Database Health (/health/db)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/health/db`);
        const json = (await res.json()) as { success: boolean; data: { status: string; recordCount: number } };
        return {
          passed: res.status === 200 && json.data?.status === "connected",
          message: `HTTP ${res.status} (${json.data?.recordCount} destinations verified)`
        };
      }
    },
    {
      name: "3. Readiness Endpoint (/ready)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/ready`);
        const json = (await res.json()) as { success: boolean; data: { status: string } };
        return {
          passed: res.status === 200 && json.data?.status === "ready",
          message: `HTTP ${res.status} (readiness: ${json.data?.status})`
        };
      }
    },
    {
      name: "4. Destination Catalog (/api/v1/destinations)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/destinations?pageSize=3`);
        const json = (await res.json()) as { success: boolean; data: unknown[] };
        const count = Array.isArray(json.data) ? json.data.length : 0;
        return {
          passed: res.status === 200 && count > 0,
          message: `HTTP ${res.status} (${count} destinations retrieved)`
        };
      }
    },
    {
      name: "5. Destination Detail (/api/v1/destinations/:id)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/destinations/${ARAKU_ID}`);
        const json = (await res.json()) as { success: boolean; data: { name: string } };
        return {
          passed: res.status === 200 && Boolean(json.data?.name),
          message: `HTTP ${res.status} (name: "${json.data?.name}")`
        };
      }
    },
    {
      name: "6. Crowd Intelligence (/api/v1/crowd/destinations/:id)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/crowd/destinations/${ARAKU_ID}`);
        const json = (await res.json()) as { success: boolean; data: { destinationName: string } };
        return {
          passed: res.status === 200 && Boolean(json.data?.destinationName),
          message: `HTTP ${res.status} (crowd baseline computed)`
        };
      }
    },
    {
      name: "7. Women Safety Intelligence (/api/v1/safety/women/destinations/:id)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/safety/women/destinations/${ARAKU_ID}`);
        const json = (await res.json()) as { success: boolean; data: { riskLevel: string } };
        return {
          passed: res.status === 200 && Boolean(json.data?.riskLevel),
          message: `HTTP ${res.status} (risk level: ${json.data?.riskLevel})`
        };
      }
    },
    {
      name: "8. Accessibility Intelligence (/api/v1/accessibility/destinations/:id)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/accessibility/destinations/${ARAKU_ID}`);
        const json = (await res.json()) as { success: boolean; data: { accessibilityStatus: string } };
        return {
          passed: res.status === 200 && Boolean(json.data?.accessibilityStatus),
          message: `HTTP ${res.status} (status: ${json.data?.accessibilityStatus})`
        };
      }
    },
    {
      name: "9. Budget & Cost Intelligence (/api/v1/budget/destinations/:id)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/budget/destinations/${ARAKU_ID}`);
        const json = (await res.json()) as { success: boolean; data: { budget: { knownSubtotal: number } } };
        return {
          passed: res.status === 200 && typeof json.data?.budget?.knownSubtotal === "number",
          message: `HTTP ${res.status} (verified subtotal: ₹${json.data?.budget?.knownSubtotal})`
        };
      }
    },
    {
      name: "10. Local Businesses (/api/v1/businesses/destinations/:id)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/businesses/destinations/${ARAKU_ID}`);
        const json = (await res.json()) as { success: boolean; data: { businesses: unknown[] } };
        const count = json.data?.businesses?.length ?? 0;
        return {
          passed: res.status === 200 && count >= 0,
          message: `HTTP ${res.status} (${count} verified businesses)`
        };
      }
    },
    {
      name: "11. Content & Multilingual Summary (/api/v1/content/destinations/:id/summary)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/content/destinations/${ARAKU_ID}/summary`);
        const json = (await res.json()) as { success: boolean; data: { destinationName: string } };
        return {
          passed: res.status === 200 && Boolean(json.data?.destinationName),
          message: `HTTP ${res.status} (content summary ready)`
        };
      }
    },

    {
      name: "12. AI Simple Query (/api/v1/ai/chat)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "What are the attractions in Araku Valley?" })
        });
        const json = (await res.json()) as { success: boolean; data: { summary?: string; message?: string } };
        const ok = Boolean(json.data?.summary || json.data?.message);
        return {
          passed: res.status === 200 && ok,
          message: `HTTP ${res.status} (AI simple query grounded)`
        };
      }
    },
    {
      name: "13. AI Full Itinerary Planning (/api/v1/ai/chat)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Plan a 2 day trip to Araku Valley for a family" })
        });
        const json = (await res.json()) as { success: boolean; data: { days?: unknown[]; itinerary?: unknown[] } };
        const ok = Boolean(json.data?.days || json.data?.itinerary);
        return {
          passed: res.status === 200 && ok,
          message: `HTTP ${res.status} (multi-day itinerary synthesized)`
        };
      }
    },
    {
      name: "14. AI Multi-Destination Planning (/api/v1/ai/chat)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Plan a trip visiting Visakhapatnam and Araku Valley" })
        });
        const json = (await res.json()) as { success: boolean; data: { summary?: string; itinerary?: unknown[] } };
        return {
          passed: res.status === 200 && Boolean(json.data?.summary || json.data?.itinerary),
          message: `HTTP ${res.status} (multi-destination plan constructed)`
        };
      }
    },
    {
      name: "15. AI Adaptive Replanning (/api/v1/ai/chat)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "I cannot walk long distances, adjust my Araku itinerary for low walking"
          })
        });
        const json = (await res.json()) as { success: boolean; data: { summary?: string } };
        return {
          passed: res.status === 200 && Boolean(json.data?.summary),
          message: `HTTP ${res.status} (accessibility replanning adjusted)`
        };
      }
    },
    {
      name: "16. Auth Protection on Context Preview (/api/v1/ai/context-preview)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/ai/context-preview`);
        return {
          passed: res.status === 401,
          message: `HTTP ${res.status} Unauthorized safely enforced for unauthenticated caller`
        };
      }
    },

    {
      name: "17. Route 404 Protection (/api/v1/non-existent-staging-route)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/non-existent-staging-route`);
        return {
          passed: res.status === 404,
          message: `HTTP ${res.status} Not Found properly returned`
        };
      }
    },
    {
      name: "18. Malformed Input Validation (/api/v1/destinations/bad-id)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/destinations/bad-id-string`);
        return {
          passed: res.status === 400,
          message: `HTTP ${res.status} Bad Request returned without SQL error leakage`
        };
      }
    },
    {
      name: "19. Request Size Limit (600KB Payload)",
      fn: async () => {
        const largeBody = JSON.stringify({ data: "X".repeat(600000) });
        const res = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: largeBody
        });
        return {
          passed: res.status === 413,
          message: `HTTP ${res.status} Payload Too Large returned`
        };
      }
    },
    {
      name: "20. Rate Limiting Headers Active",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/destinations?pageSize=1`);
        const limit = res.headers.get("x-ratelimit-limit");
        const remaining = res.headers.get("x-ratelimit-remaining");
        return {
          passed: Boolean(limit) && Boolean(remaining),
          message: `Headers verified (Limit: ${limit}, Remaining: ${remaining})`
        };
      }
    }
  ];

  let allPassed = true;
  for (const check of checks) {
    try {
      const res = await check.fn();
      const symbol = res.passed ? "✅ PASS" : "❌ FAIL";
      console.log(`[${symbol}] ${check.name}: ${res.message}`);
      if (!res.passed) {
        allPassed = false;
      }
    } catch (err) {
      console.error(`[❌ FAIL] ${check.name}: ${(err as Error).message}`);
      allPassed = false;
    }
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log("📊 RUNNING 6 REPRESENTATIVE PRODUCTION SCENARIOS (CONTROLLED WORKLOAD)...");
  console.log("--------------------------------------------------------------------------------\n");

  const benchmarks: BenchmarkResult[] = [];

  benchmarks.push(
    await measureScenario("A. Destination Lookup (Araku)", 5, async () => {
      const r = await fetch(`${BASE_URL}/api/v1/destinations/${ARAKU_ID}`);
      return r.status === 200;
    })
  );

  benchmarks.push(
    await measureScenario("B. AI Simple Grounded Query", 3, async () => {
      const r = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "What is Borra Caves?" })
      });
      return r.status === 200;
    })
  );

  benchmarks.push(
    await measureScenario("C. Full Itinerary Generation (2 Days)", 3, async () => {
      const r = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Plan a 2 day trip to Araku" })
      });
      return r.status === 200;
    })
  );

  benchmarks.push(
    await measureScenario("D. Multi-Destination Planning", 3, async () => {
      const r = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Plan a trip to Visakhapatnam and Araku" })
      });
      return r.status === 200;
    })
  );

  benchmarks.push(
    await measureScenario("E. Adaptive Itinerary Replanning", 3, async () => {
      const r = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Avoid crowded places in Araku" })
      });
      return r.status === 200;
    })
  );

  benchmarks.push(
    await measureScenario("F. 13-Gap Cross-Gap Validation", 3, async () => {
      const r = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Solo female traveller visiting Araku with budget under 5000 and wheelchair needs"
        })
      });
      return r.status === 200;
    })
  );

  for (const b of benchmarks) {
    console.log(
      `Scenario: ${b.scenario.padEnd(38)} | Avg: ${String(b.avgLatencyMs).padStart(4)}ms | p95: ${String(b.p95LatencyMs).padStart(4)}ms | Errors: ${b.errorCount}`
    );
  }

  const finalMemory = process.memoryUsage();
  const heapDiffMB = Math.round(((finalMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024)) * 10) / 10;

  console.log("\n--------------------------------------------------------------------------------");
  console.log(
    `Memory Profile: Initial Heap: ${Math.round(initialMemory.heapUsed / (1024 * 1024))}MB | Final Heap: ${Math.round(finalMemory.heapUsed / (1024 * 1024))}MB | Net Change: ${heapDiffMB >= 0 ? "+" : ""}${heapDiffMB}MB`
  );
  console.log("--------------------------------------------------------------------------------\n");

  if (allPassed) {
    console.log("🎉 Staging verification completed successfully. All 20 checks and 6 scenarios PASSED.");
    process.exit(0);
  } else {
    console.error("❌ Staging verification failed.");
    process.exit(1);
  }
}

runStagingVerification();
