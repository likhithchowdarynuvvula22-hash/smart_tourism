import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

describe("Health & Database Probe Suite", () => {
  const app = createApp();

  it("should return 200 OK with healthy status on GET /health", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body).toHaveProperty("message");
    expect(response.body.data).toHaveProperty("status", "healthy");
    expect(response.body.data).toHaveProperty("service", "sih-tourism-backend");
    expect(response.body.data).toHaveProperty("uptimeSeconds");
    expect(response.body.data).toHaveProperty("timestamp");
  });

  it("should return 200 OK on GET /api/v1/health", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body.data).toHaveProperty("status", "healthy");
  });

  it("should return 200 OK with database connection status on GET /health/db", async () => {
    const response = await request(app).get("/health/db");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body.data).toHaveProperty("status", "connected");
    expect(response.body.data).toHaveProperty("verifiedTable", "destinations");
    expect(response.body.data).toHaveProperty("recordCount");
    expect(response.body.data.recordCount).toBeGreaterThanOrEqual(600);
    expect(response.body.data).toHaveProperty("latencyMs");
  });

  it("should return 404 NOT_FOUND on unknown route", async () => {
    const response = await request(app).get("/non-existent-endpoint");

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty("success", false);
    expect(response.body.error).toHaveProperty("code", "NOT_FOUND");
    expect(response.body.error).toHaveProperty("message");
    expect(response.body.error.message).toContain("Resource not found");
  });
});
