import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import aiRoutes from "../src/routes/ai.routes";
import { errorHandler } from "../src/middleware/errorHandler";
import { AuthenticatedUser } from "../src/types/auth";

const touristA: AuthenticatedUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "touristA@example.com",
  role: "tourist",
  roles: ["tourist"]
};

const touristB: AuthenticatedUser = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "touristB@example.com",
  role: "tourist",
  roles: ["tourist"]
};

/**
 * The real authenticate() middleware short-circuits when req.user is already
 * populated (validated auth context), so injecting the user via middleware
 * exercises the full route chain without forging tokens.
 */
const createTestApp = (mockUser?: AuthenticatedUser) => {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (mockUser) {
      req.user = mockUser;
    }
    next();
  });
  app.use("/api/v1/ai", aiRoutes);
  app.use(errorHandler);
  return app;
};

describe("Phase 8B: Context Preview Suite", () => {
  beforeEach(() => {});

  it("9. authenticated preview returns own normalized context", async () => {
    const res = await request(createTestApp(touristA)).get("/api/v1/ai/context-preview");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.identity.authenticated).toBe(true);
    expect(data.identity.role).toBe("tourist");
    expect(data.storedPreferences).toBeDefined();
    expect(data.travellerContext).toBeDefined();
    expect(Array.isArray(data.unknowns)).toBe(true);
  });

  it("10. unauthenticated preview is rejected with 401", async () => {
    const res = await request(createTestApp(undefined)).get("/api/v1/ai/context-preview");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("11. only the caller's own data is returned (per-user isolation)", async () => {
    const resA = await request(createTestApp(touristA)).get("/api/v1/ai/context-preview");
    const resB = await request(createTestApp(touristB)).get("/api/v1/ai/context-preview");
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    // No user identifiers leak; each response is scoped to its caller.
    expect(JSON.stringify(resA.body.data)).not.toContain(touristB.id);
    expect(JSON.stringify(resB.body.data)).not.toContain(touristA.id);
  });

  it("12. safe DTO excludes secrets and private internals", async () => {
    const res = await request(createTestApp(touristA)).get("/api/v1/ai/context-preview");
    const serialized = JSON.stringify(res.body.data);
    for (const forbidden of [
      /password/i,
      /token/i,
      /secret/i,
      /service_role/i,
      /supabase_key/i,
      /travel_preferences/i,
      /tourist_profiles/i,
      /users_profile/i,
      new RegExp(touristA.email!, "i")
    ]) {
      expect(serialized).not.toMatch(forbidden);
    }
  });

  it("13. distinguishes stored values from unknown fields", async () => {
    const res = await request(createTestApp(touristA)).get("/api/v1/ai/context-preview");
    const data = res.body.data;
    // Unknown fields are explicitly listed rather than silently defaulted:
    expect(Array.isArray(data.unknowns)).toBe(true);
    expect(data.unknowns.length).toBeGreaterThan(0);
    // Stored block exists with explicit null-or-value semantics:
    expect(data.storedPreferences).toHaveProperty("language");
    expect(data.storedPreferences.budget).toHaveProperty("min");
    expect(data.storedPreferences.budget).toHaveProperty("max");
  });

  it("14. includes constraint summary", async () => {
    const res = await request(createTestApp(touristA)).get("/api/v1/ai/context-preview");
    expect(res.body.data.constraints).toBeDefined();
    expect(Array.isArray(res.body.data.constraints.hard)).toBe(true);
    expect(Array.isArray(res.body.data.constraints.soft)).toBe(true);
    expect(res.body.data.travellerContext.activeHardConstraints).toBeDefined();
  });

  it("15. includes optimization objectives", async () => {
    const res = await request(createTestApp(touristA)).get("/api/v1/ai/context-preview");
    expect(Array.isArray(res.body.data.constraints.objectives)).toBe(true);
    // Fee minimization is a baseline derived objective:
    expect(
      res.body.data.constraints.objectives.some((o: string) => o.includes("fee_minimization"))
    ).toBe(true);
  });
});
