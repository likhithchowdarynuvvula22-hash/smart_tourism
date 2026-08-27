const BASE_URL = process.env.SMOKE_TEST_URL || "http://localhost:5000";
const ARAKU_ID = "01e98249-049a-4017-a5fb-98b913e05ca5";

interface SmokeCheck {
  name: string;
  fn: () => Promise<{ passed: boolean; message: string }>;
}

async function runSmokeTests(): Promise<void> {
  console.log(`🚀 Executing SIH Smart Tourism Backend Smoke Tests against ${BASE_URL}...\n`);

  const checks: SmokeCheck[] = [
    {
      name: "1. Health Probe (/health)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/health`);
        const json = (await res.json()) as { success: boolean; data: { status: string } };
        return {
          passed: res.status === 200 && json.data.status === "healthy",
          message: `HTTP ${res.status} (status: ${json.data?.status})`
        };
      }
    },
    {
      name: "2. Readiness Probe (/ready)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/ready`);
        const json = (await res.json()) as { success: boolean; data: { status: string } };
        return {
          passed: res.status === 200 && json.data.status === "ready",
          message: `HTTP ${res.status} (readiness: ${json.data?.status})`
        };
      }
    },
    {
      name: "3. Destination Catalog (/api/v1/destinations)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/destinations?pageSize=3`);
        const json = (await res.json()) as { success: boolean; data: unknown[]; pagination?: unknown };
        const count = Array.isArray(json.data) ? json.data.length : 0;
        return {
          passed: res.status === 200 && count > 0,
          message: `HTTP ${res.status} (received ${count} destinations)`
        };
      }
    },

    {
      name: "4. Destination Detail (/api/v1/destinations/:id)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/destinations/${ARAKU_ID}`);
        const json = (await res.json()) as { success: boolean; data: { name: string } };
        return {
          passed: res.status === 200 && Boolean(json.data?.name),
          message: `HTTP ${res.status} (destination: "${json.data?.name}")`
        };
      }
    },
    {
      name: "5. Crowd Intelligence (/api/v1/crowd/destinations/:id)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/crowd/destinations/${ARAKU_ID}`);
        const json = (await res.json()) as { success: boolean; data: { destinationName: string } };
        return {
          passed: res.status === 200 && Boolean(json.data?.destinationName),
          message: `HTTP ${res.status} (crowd baseline retrieved)`
        };
      }
    },
    {
      name: "6. Grounded AI Query (/api/v1/ai/chat)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "What is Araku known for?" })
        });
        const json = (await res.json()) as { success: boolean; data: { summary?: string; message?: string } };
        const hasContent = Boolean(json.data?.summary || json.data?.message);
        return {
          passed: res.status === 200 && hasContent,
          message: `HTTP ${res.status} (grounded response synthesized)`
        };
      }
    },
    {
      name: "7. Input Validation Handling (/api/v1/destinations/invalid-id)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/destinations/invalid-uuid`);
        return {
          passed: res.status === 400,
          message: `HTTP ${res.status} Bad Request correctly returned for malformed UUID`
        };
      }
    },
    {
      name: "8. 404 Route Protection (/api/v1/non-existent-endpoint)",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/non-existent-endpoint`);
        return {
          passed: res.status === 404,
          message: `HTTP ${res.status} Not Found correctly returned`
        };
      }
    },
    {
      name: "9. Rate Limiting Headers",
      fn: async () => {
        const res = await fetch(`${BASE_URL}/api/v1/destinations?pageSize=1`);
        const limitHeader = res.headers.get("x-ratelimit-limit");
        return {
          passed: Boolean(limitHeader),
          message: `Rate limit header present (Limit: ${limitHeader})`
        };
      }
    }
  ];

  let allPassed = true;
  for (const check of checks) {
    try {
      const result = await check.fn();
      const symbol = result.passed ? "✅ PASS" : "❌ FAIL";
      console.log(`[${symbol}] ${check.name}: ${result.message}`);
      if (!result.passed) {
        allPassed = false;
      }
    } catch (err: unknown) {
      console.error(`[❌ FAIL] ${check.name}: Exception: ${(err as Error).message}`);
      allPassed = false;
    }
  }

  console.log("\n---------------------------------------------------------");
  if (allPassed) {
    console.log("🎉 All production smoke tests PASSED.");
    process.exit(0);
  } else {
    console.error("❌ Some smoke tests FAILED.");
    process.exit(1);
  }
}

runSmokeTests();
