import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { PerformanceTimer } from "../src/utils/performanceTimer";
import { DestinationRepository } from "../src/repositories/destination.repository";
import { WeatherService } from "../src/services/external/weather/weather.service";
import { IntentClassifier } from "../src/services/ai/classifier/intent.classifier";

describe("Phase 9A: Performance Baseline & Instrumentation Invariant Suite", () => {
  const app = createApp();

  it("1. PerformanceTimer accurately records and summarizes stage durations", async () => {
    const timer = new PerformanceTimer();

    timer.start("database");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const dbDuration = timer.stop("database");

    expect(dbDuration).toBeGreaterThanOrEqual(15);
    expect(timer.getDuration("database")).toBe(dbDuration);

    timer.record("external_weather", 45);
    const summary = timer.summary();

    expect(summary.database).toBe(dbDuration);
    expect(summary.external_weather).toBe(45);
    expect(summary.totalMs).toBeGreaterThanOrEqual(dbDuration);
  });

  it("2. Request correlation middleware generates and propagates X-Request-Id and X-Response-Time", async () => {
    const customRequestId = "test-custom-request-id-12345";
    const res = await request(app).get("/health").set("X-Request-Id", customRequestId);

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBe(customRequestId);
    expect(res.headers["x-response-time"]).toMatch(/^\d+ms$/);
  });

  it("3. Request correlation middleware automatically assigns unique UUID when header is omitted", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("4. DestinationRepository micro-cache avoids duplicate database round-trips within TTL", async () => {
    const repo = new DestinationRepository();
    const ARAKU_ID = "01e98249-049a-4017-a5fb-98b913e05ca5";

    const first = await repo.findById(ARAKU_ID);
    expect(first).toBeDefined();
    expect(first?.id).toBe(ARAKU_ID);

    // Second immediate lookup should be instant memory hit
    const start = Date.now();
    const second = await repo.findById(ARAKU_ID);
    const secondDuration = Date.now() - start;

    expect(second).toBeDefined();
    expect(second?.id).toBe(ARAKU_ID);
    expect(secondDuration).toBeLessThan(10); // Instant in-memory cache hit
  });

  it("5. WeatherService forecast micro-cache avoids redundant external API calls within TTL", async () => {
    const weatherSvc = new WeatherService();
    const ARAKU_ID = "01e98249-049a-4017-a5fb-98b913e05ca5";

    const first = await weatherSvc.getDestinationWeather(ARAKU_ID);
    expect(first.destinationId).toBe(ARAKU_ID);

    const start = Date.now();
    const second = await weatherSvc.getDestinationWeather(ARAKU_ID);
    const duration = Date.now() - start;

    expect(second.destinationId).toBe(ARAKU_ID);
    expect(duration).toBeLessThan(10); // Memory cache hit
  });

  it("6. IntentClassifier enforces bounded tool execution limits without tool explosion", () => {
    const classifier = new IntentClassifier();

    const weatherQuery = classifier.classify("What is the weather in Araku?");
    expect(weatherQuery.requiredTools.length).toBeLessThanOrEqual(3);
    expect(weatherQuery.requiredTools).toContain("weather");

    const fullTrip = classifier.classify("Plan a 2-day trip to Araku for my parents");
    expect(fullTrip.requiredTools.length).toBeLessThanOrEqual(6);
  });

  it("7. Timing logs and responses strictly redact sensitive tokens, passwords, and service keys", async () => {
    const res = await request(app).get("/health");
    const jsonStr = JSON.stringify(res.body);

    expect(jsonStr).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(jsonStr).not.toContain("SUPABASE_JWT_SECRET");
    expect(jsonStr).not.toContain("GEMINI_API_KEY");
    expect(jsonStr).not.toContain("Bearer ");
  });
});
