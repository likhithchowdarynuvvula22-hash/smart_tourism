import request from "supertest";
import { createApp } from "../src/app";

interface ScenarioStats {
  scenario: string;
  endpoint: string;
  method: string;
  samples: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  errors: number;
  avgPayloadBytes: number;
  toolCallsEstimate?: number;
}

function calculatePercentiles(latencies: number[]): {
  min: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
} {
  if (latencies.length === 0) {
    return { min: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = Math.round((sum / sorted.length) * 10) / 10;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || max;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || max;

  return { min, avg, p50, p95, p99, max };
}

async function runBenchmark() {
  const app = createApp();
  const ARAKU_ID = "01e98249-049a-4017-a5fb-98b913e05ca5";

  const initialMem = process.memoryUsage();
  console.log(`[STARTUP] Initial Memory: RSS = ${(initialMem.rss / 1024 / 1024).toFixed(1)}MB, HeapUsed = ${(initialMem.heapUsed / 1024 / 1024).toFixed(1)}MB`);

  const results: ScenarioStats[] = [];

  const scenarios = [
    { name: "A. Health Probe", method: "GET", url: "/health", count: 30 },
    { name: "B. DB Health Probe", method: "GET", url: "/health/db", count: 15 },
    { name: "C. Destination Catalog", method: "GET", url: "/api/v1/destinations", count: 20 },
    { name: "D. Destination Detail", method: "GET", url: `/api/v1/destinations/${ARAKU_ID}`, count: 20 },
    { name: "E. Destination Safety", method: "GET", url: `/api/v1/destinations/${ARAKU_ID}/safety`, count: 15 },
    { name: "F. Crowd Intelligence", method: "GET", url: `/api/v1/crowd/destinations/${ARAKU_ID}`, count: 15 },
    { name: "G. Women Safety", method: "GET", url: `/api/v1/safety/women/destinations/${ARAKU_ID}`, count: 15 },
    { name: "H. Accessibility", method: "GET", url: `/api/v1/accessibility/destinations/${ARAKU_ID}`, count: 15 },
    { name: "I. Budget Intelligence", method: "GET", url: `/api/v1/budget/destinations/${ARAKU_ID}`, count: 15 },
    { name: "J. Local Businesses", method: "GET", url: `/api/v1/businesses/destinations/${ARAKU_ID}`, count: 15 },
    { name: "K. Content Summary", method: "GET", url: `/api/v1/content/destinations/${ARAKU_ID}/summary`, count: 15 },
    { name: "L. AI Simple Query", method: "POST", url: "/api/v1/ai/chat", body: { message: "What is the best time to visit Araku?" }, count: 5 },
    { name: "M. AI Budget Query", method: "POST", url: "/api/v1/ai/chat", body: { message: "How much does a trip to Araku cost?" }, count: 5 },
    { name: "N. AI Accessibility Query", method: "POST", url: "/api/v1/ai/chat", body: { message: "Wheelchair accessible places in Araku" }, count: 5 },
    { name: "O. AI Full Itinerary", method: "POST", url: "/api/v1/ai/chat", body: { message: "Plan a 2-day trip to Araku" }, count: 5 },
    { name: "P. AI Multi-Destination", method: "POST", url: "/api/v1/ai/chat", body: { message: "Plan 3 days covering Fort Kochi and Munnar" }, count: 5 },
    { name: "Q. AI Adaptive Itinerary", method: "POST", url: "/api/v1/ai/chat", body: { message: "It's raining today in Araku, adapt plan" }, count: 5 },
    {
      name: "R. Full 13-Gap Scenario",
      method: "POST",
      url: "/api/v1/ai/chat",
      body: {
        message: "Plan a 3-day trip to Kerala for my parents. My budget is ₹10,000. I need wheelchair support. Avoid crowded places. Prefer local community experiences. Make it as eco-friendly as possible. Answer in Telugu."
      },
      count: 5
    }
  ];

  for (const s of scenarios) {
    const latencies: number[] = [];
    let errors = 0;
    let totalBytes = 0;

    for (let i = 0; i < s.count; i++) {
      const start = Date.now();
      try {
        let reqBuilder = (request(app) as unknown as Record<string, (url: string) => request.Test>)[s.method.toLowerCase()](s.url);
        if (s.body) {
          reqBuilder = reqBuilder.send(s.body);
        }
        const res = await reqBuilder;
        const duration = Date.now() - start;
        latencies.push(duration);
        totalBytes += JSON.stringify(res.body || {}).length;
        if (res.status >= 400) {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    const stats = calculatePercentiles(latencies);
    results.push({
      scenario: s.name,
      endpoint: s.url,
      method: s.method,
      samples: s.count,
      minMs: stats.min,
      avgMs: stats.avg,
      p50Ms: stats.p50,
      p95Ms: stats.p95,
      p99Ms: stats.p99,
      maxMs: stats.max,
      errors,
      avgPayloadBytes: Math.round(totalBytes / s.count)
    });
  }

  const finalMem = process.memoryUsage();
  console.log(`[BENCHMARK] Peak Memory: RSS = ${(finalMem.rss / 1024 / 1024).toFixed(1)}MB, HeapUsed = ${(finalMem.heapUsed / 1024 / 1024).toFixed(1)}MB`);

  console.log("\n=== PERFORMANCE BASELINE AUDIT RESULTS (SCENARIOS A - R) ===");
  console.table(results);
  console.log(JSON.stringify(results, null, 2));
}

runBenchmark().catch((err) => {
  console.error("Benchmark error:", err);
  process.exit(1);
});
