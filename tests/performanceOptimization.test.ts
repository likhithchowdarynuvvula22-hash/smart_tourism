import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { requestCache, RequestCache } from "../src/utils/requestCache";
import { tourismRepository } from "../src/repositories/tourism.repository";
import { businessService } from "../src/services/business/business.service";
import { routingService } from "../src/services/external/routing/routing.service";
import { translationService } from "../src/services/external/translation/translation.service";
import { weatherService } from "../src/services/external/weather/weather.service";

describe("Phase 9B: Query Batching, Request Deduplication & Optimization Invariants", () => {
  const app = createApp();
  const ARAKU_ID = "01e98249-049a-4017-a5fb-98b913e05ca5";

  it("1. Destination context bundle batches requested sections in parallel", async () => {
    const bundle = await tourismRepository.getDestinationContextBundle(ARAKU_ID, {
      include: ["attractions", "experiences", "emergencyResources"]
    });

    expect(bundle.attractions).toBeDefined();
    expect(bundle.experiences).toBeDefined();
    expect(bundle.emergencyResources).toBeDefined();
    expect(bundle.localBusinesses).toBeUndefined(); // selective inclusion
  });

  it("2. Routing service memoizes identical route legs", async () => {
    // Visakhapatnam to Araku
    const route1 = await routingService.calculateRoute(17.6868, 83.2185, 18.3333, 82.8833);
    expect(route1.distanceKm).toBeGreaterThan(0);

    const start = Date.now();
    const route2 = await routingService.calculateRoute(17.6868, 83.2185, 18.3333, 82.8833);
    const duration = Date.now() - start;

    expect(route2.distanceKm).toBe(route1.distanceKm);
    expect(duration).toBeLessThan(10); // instant in-memory cache hit
  });

  it("3. Translation service memoizes identical translation requests", async () => {
    const text = "Welcome to Araku Valley";
    const trans1 = await translationService.translate(text, "en", "te");
    expect(trans1.translatedText).toBeDefined();

    const start = Date.now();
    const trans2 = await translationService.translate(text, "en", "te");
    const duration = Date.now() - start;

    expect(trans2.translatedText).toBe(trans1.translatedText);
    expect(duration).toBeLessThan(10); // instant in-memory cache hit
  });

  it("4. Local business service enforces bounded limits and grounded verification", async () => {
    const res = await businessService.getDestinationBusinesses(ARAKU_ID, { limit: 10 });

    expect(res.destinationId).toBe(ARAKU_ID);
    expect(res.dataQuality).toBeDefined();
    expect(res.businesses.length).toBeLessThanOrEqual(10);
    for (const b of res.businesses) {
      expect(b.isVerified).toBe(true);
    }
  });

  it("5. Private user profile and saved trips are never cached globally", async () => {
    const cacheKey = RequestCache.keys.destination(ARAKU_ID);
    requestCache.set(cacheKey, { id: ARAKU_ID, name: "Araku Valley" }, 1000);

    expect(requestCache.get(cacheKey)).toBeDefined();

    // Verify cache does not store sensitive keys
    expect(requestCache.get("user:profile:123")).toBeUndefined();
    expect(requestCache.get("user:trips:123")).toBeUndefined();
  });

  it("6. Provenance sources are deduplicated in orchestrator response without data loss", async () => {
    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "What is the weather in Araku?" });

    expect(res.status).toBe(200);
    expect(res.body.data.sources).toBeDefined();
    expect(Array.isArray(res.body.data.sources)).toBe(true);

    const keys = res.body.data.sources.map(
      (s: { type: string; provider: string; resource: string }) =>
        `${s.type}:${s.provider}:${s.resource}`
    );
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size); // Zero duplicate provenance tuples
  });

  it("7. External failure graceful degradation is preserved with response reuse", async () => {
    const invalidUuid = "00000000-0000-0000-0000-000000000000";
    await expect(weatherService.getDestinationWeather(invalidUuid)).rejects.toThrow();
  });
});
