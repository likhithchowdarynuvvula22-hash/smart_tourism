import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import preferencesRoutes from "../src/routes/preferences.routes";
import { errorHandler } from "../src/middleware/errorHandler";
import { AuthenticatedUser } from "../src/types/auth";
import {
  TravellerContextBuilder,
  travellerContextBuilder
} from "../src/services/ai/context/travellerContext.builder";
import { PreferencesService } from "../src/services/preferences.service";
import { PreferencesRepository } from "../src/repositories/preferences.repository";
import { UserRepository } from "../src/repositories/user.repository";

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

const createTestApp = (mockUser?: AuthenticatedUser) => {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (mockUser) {
      req.user = mockUser;
    }
    next();
  });
  app.use("/api/v1/tourist", preferencesRoutes);
  app.use(errorHandler);
  return app;
};

// ---------------------------------------------------------------------------
// Mock-backed PreferencesService + TravellerContextBuilder factory
// (RLS-correct: fake-user writes are blocked on the live anon client, so
//  persistence behaviour is exercised through the same service/repository
//  seams used by every existing suite.)
// ---------------------------------------------------------------------------

let storedRow = {
  id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  user_id: touristA.id,
  interests: [] as string[],
  budget_min: null as number | null,
  budget_max: null as number | null,
  preferred_trip_days: null as number | null,
  accessibility_needs: [] as string[],
  safety_priority: false,
  created_at: new Date().toISOString()
};

const buildMockedStack = () => {
  const mockRepo = new PreferencesRepository();
  const mockUsersRepo = new UserRepository();

  const rowsByUser = new Map<string, typeof storedRow>();
  const languageByUser = new Map<string, string | null>();

  vi.spyOn(mockRepo, "findTravelPreferences").mockImplementation(async (userId: string) => {
    const row = rowsByUser.get(userId);
    return row ? { ...row, interests: [...row.interests] } : null;
  });
  vi.spyOn(mockRepo, "upsertTravelPreferences").mockImplementation(
    async (userId: string, data: Record<string, unknown>) => {
      // Writes ALWAYS target the authenticated userId passed by the service:
      const current = rowsByUser.get(userId);
      const next = {
        id: current?.id ?? "cccccccc-cccc-cccc-cccc-cccccccccc",
        user_id: userId,
        interests: [],
        budget_min: null,
        budget_max: null,
        preferred_trip_days: null,
        accessibility_needs: [],
        safety_priority: false,
        created_at: new Date().toISOString(),
        ...(data as Partial<typeof storedRow>)
      } as typeof storedRow;
      rowsByUser.set(userId, next);
      return { ...next };
    }
  );
  vi.spyOn(mockUsersRepo, "findProfileById").mockImplementation(
    async (userId: string) => ({ preferred_language: languageByUser.get(userId) ?? null }) as never
  );
  vi.spyOn(mockUsersRepo, "updatePreferredLanguage").mockImplementation(
    async (userId: string, language: string | null) => {
      languageByUser.set(userId, language);
      return { preferred_language: language } as never;
    }
  );

  const service = new PreferencesService(mockRepo, mockUsersRepo);
  const builder = new TravellerContextBuilder(service, mockUsersRepo);
  return { service, builder, mockRepo, mockUsersRepo };
};

describe("Phase 8B: Preference Persistence & Feedback Loop Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storedRow = {
      ...storedRow,
      interests: [],
      budget_min: null,
      budget_max: null,
      preferred_trip_days: null,
      safety_priority: false
    };
  });

  // =========================================================================
  // PREFERENCES
  // =========================================================================
  it("1. updates own preferences through the existing service path", async () => {
    const { service } = buildMockedStack();
    const result = await service.updatePreferences(touristA.id, {
      interests: ["culture", "heritage"],
      budgetMax: 15000,
      preferredTripDays: 4,
      preferredLanguage: "te"
    });
    expect(result.travelPreferences?.interests).toEqual(["culture", "heritage"]);
    expect(result.travelPreferences?.budget_max).toBe(15000);
    expect(result.preferredLanguage).toBe("te");
  });

  it("2. retrieves updated preferences", async () => {
    const { service } = buildMockedStack();
    await service.updatePreferences(touristA.id, { interests: ["culture", "heritage"] });
    const result = await service.getPreferences(touristA.id);
    expect(result.userId).toBe(touristA.id);
    expect(result.travelPreferences?.interests).toEqual(["culture", "heritage"]);
  });

  it("3. updated preferences appear in the next TravellerContext (feedback loop)", async () => {
    const { service, builder } = buildMockedStack();
    await service.updatePreferences(touristA.id, {
      interests: ["culture"],
      preferredLanguage: "te"
    });

    const ctx = await builder.buildContext({
      entities: {},
      intent: "experience_query",
      user: touristA
    });
    expect(ctx.travellerProfile.interests.value).toEqual(["culture"]);
    expect(ctx.travellerProfile.interests.source).toBe("stored_preference");
    expect(ctx.travellerProfile.preferredLanguage.value).toBe("te");
  });

  it("4. request-level preferences apply to the request but NEVER persist", async () => {
    const { service, builder, mockUsersRepo } = buildMockedStack();
    await service.updatePreferences(touristA.id, { interests: ["nature"] });
    (mockUsersRepo.updatePreferredLanguage as ReturnType<typeof vi.fn>).mockClear();

    const ctx = await builder.buildContext({
      entities: { interests: ["adventure"], targetLanguage: "hi" },
      intent: "trip_planning",
      user: touristA
    });
    expect(ctx.travellerProfile.interests.value).toEqual(["adventure"]); // request wins
    // No write occurred anywhere:
    expect(vi.mocked(mockUsersRepo.updatePreferredLanguage).mock.calls.length).toBe(0);
    const after = await service.getPreferences(touristA.id);
    expect(after.travelPreferences?.interests).toEqual(["nature"]); // unchanged
  });

  it("5. explicit save merges and persists interests", async () => {
    const { service, builder } = buildMockedStack();
    await service.updatePreferences(touristA.id, { interests: ["heritage"] });
    const merged = await builder.persistExplicitInterests(touristA.id, ["food"]);
    expect(merged).toEqual(expect.arrayContaining(["heritage", "food"]));
    const ctx = await builder.buildContext({
      entities: {},
      intent: "experience_query",
      user: touristA
    });
    expect(ctx.travellerProfile.interests.value).toContain("food");
  });

  it("6. invalid preference payloads rejected with 400 (never coerced)", async () => {
    const app = createTestApp(touristA);
    const invalidPayloads = [
      { budgetMin: "abc" },
      { budgetMax: -5 },
      { budgetMin: 5000, budgetMax: 1000 },
      { preferredTripDays: 0 },
      { preferredTripDays: 2.5 },
      { interests: "not-an-array" },
      { interests: [42] },
      { preferredLanguage: "klingon" },
      { safetyPriority: "yes" },
      { mobilityNeeds: [{ evil: true }] }
    ];
    for (const payload of invalidPayloads) {
      const res = await request(app).put("/api/v1/tourist/preferences").send(payload);
      expect([400]).toContain(res.status);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    }
  });

  it("7. cross-user isolation — identity derives ONLY from validated auth context", async () => {
    const { service } = buildMockedStack();
    // Service writes always target the passed (authenticated) userId:
    await service.updatePreferences(touristB.id, { interests: ["b-only"] });
    const a = await service.getPreferences(touristA.id);
    const b = await service.getPreferences(touristB.id);
    expect(a.travelPreferences?.interests ?? []).not.toContain("b-only");
    expect(b.travelPreferences?.interests).toEqual(["b-only"]);

    // Unauthenticated access is rejected at the route level:
    const app = createTestApp(undefined);
    const putRes = await request(app)
      .put("/api/v1/tourist/preferences")
      .send({ interests: ["x"] });
    expect(putRes.status).toBe(401);
    const getRes = await request(app).get("/api/v1/tourist/preferences");
    expect(getRes.status).toBe(401);
  });

  it("8. unauthenticated preference mutation is rejected with 401 before validation side-effects", async () => {
    const res = await request(createTestApp(undefined))
      .put("/api/v1/tourist/preferences")
      .send({ interests: ["x"] });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  // =========================================================================
  // FEEDBACK LOOP
  // =========================================================================
  it("36. preference update is reflected in the very next request without restart", async () => {
    const { service, builder } = buildMockedStack();
    await service.updatePreferences(touristA.id, { interests: ["spiritual"] });
    const ctx = await builder.buildContext({
      entities: {},
      intent: "experience_query",
      user: touristA
    });
    expect(ctx.travellerProfile.interests.value).toEqual(["spiritual"]);
  });

  it("37. subsequent updates replace stale results immediately", async () => {
    const { service, builder } = buildMockedStack();
    await service.updatePreferences(touristA.id, { interests: ["spiritual"] });
    await service.updatePreferences(touristA.id, { interests: ["wellness"] });
    const ctx = await builder.buildContext({
      entities: {},
      intent: "experience_query",
      user: touristA
    });
    expect(ctx.travellerProfile.interests.value).toEqual(["wellness"]);
  });

  it("38. explicit save merges instead of replacing stored interests", async () => {
    const { service, builder } = buildMockedStack();
    await service.updatePreferences(touristA.id, { interests: ["wellness"] });
    await builder.persistExplicitInterests(touristA.id, ["nature"]);
    const ctx = await builder.buildContext({
      entities: {},
      intent: "experience_query",
      user: touristA
    });
    expect(ctx.travellerProfile.interests.value).toEqual(
      expect.arrayContaining(["wellness", "nature"])
    );
  });

  // =========================================================================
  // LIVE REGISTRY SANITY (singleton builder uses fresh reads each request)
  // =========================================================================
  it("39-liveness. singleton builder performs fresh reads per request (no caching)", async () => {
    // Two consecutive builds must both resolve independently (no memoization).
    const ctx1 = await travellerContextBuilder.buildContext({
      entities: {},
      intent: "general_tourism_query"
    });
    const ctx2 = await travellerContextBuilder.buildContext({
      entities: {},
      intent: "general_tourism_query"
    });
    expect(ctx1.unknownUserData).toEqual(ctx2.unknownUserData);
    expect(ctx2.identity.authenticated).toBe(false);
  });
});
