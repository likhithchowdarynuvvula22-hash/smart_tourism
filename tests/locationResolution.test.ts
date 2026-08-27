import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { locationResolver, LocationResolver } from "../src/services/ai/context/location.resolver";
import { TravellerContextBuilder } from "../src/services/ai/context/travellerContext.builder";
import { OrchestratorService } from "../src/services/ai/orchestrator.service";
import { PreferencesService } from "../src/services/preferences.service";
import { UserRepository } from "../src/repositories/user.repository";
import { TripService } from "../src/services/trip.service";
import { AuthenticatedUser } from "../src/types/auth";

const touristA: AuthenticatedUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "touristA@example.com",
  role: "tourist",
  roles: ["tourist"]
};

/**
 * Builds an OrchestratorService whose context layer is backed by mock
 * persistence seams (RLS-correct), while tools/intent run for real.
 */
const buildAuthedOrchestrator = () => {
  let storedInterests: string[] = [];
  const prefsService = {
    getPreferences: vi.fn().mockImplementation(async () => ({
      userId: touristA.id,
      travelPreferences: {
        id: "tp",
        user_id: touristA.id,
        interests: [...storedInterests],
        budget_min: null,
        budget_max: null,
        preferred_trip_days: null,
        accessibility_needs: [],
        safety_priority: false,
        created_at: ""
      },
      touristProfile: null
    })),
    updatePreferences: vi
      .fn()
      .mockImplementation(async (_uid: string, dto: { interests?: string[] }) => {
        if (dto.interests !== undefined) storedInterests = [...dto.interests];
        return { userId: touristA.id, travelPreferences: null, touristProfile: null };
      })
  } as unknown as PreferencesService;

  const usersRepo = {
    findProfileById: vi.fn().mockResolvedValue({ preferred_language: "te" })
  } as unknown as UserRepository;

  const tripsService = new TripService();
  vi.spyOn(tripsService, "getTrips").mockResolvedValue([
    {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      user_id: touristA.id,
      name: "My Existing Araku Trip",
      start_date: "2026-12-01",
      end_date: "2026-12-02",
      status: "planned",
      created_at: new Date().toISOString()
    }
  ] as never);
  vi.spyOn(tripsService, "getTripById").mockImplementation(async (tripId, userId) => {
    if (userId !== touristA.id) throw new Error("forbidden");
    return {
      id: tripId,
      user_id: touristA.id,
      name: "My Existing Araku Trip",
      start_date: "2026-12-01",
      end_date: "2026-12-02",
      status: "planned",
      created_at: new Date().toISOString(),
      items: [{ id: "i1" }]
    };
  });

  const builder = new TravellerContextBuilder(prefsService, usersRepo, tripsService);
  const orchestrator = new OrchestratorService(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    builder
  );
  return { orchestrator, prefsService, getStoredInterests: () => storedInterests };
};

describe("Phase 8B: Location Resolution Suite", () => {
  it("23. resolves an exact destination with high confidence", async () => {
    const r = await locationResolver.resolve("Araku Valley");
    expect(r.locationType).toBe("destination");
    expect(r.confidence).toBe("high");
    expect(r.candidateDestinations).toHaveLength(1);
    expect(r.candidateDestinations[0].name).toBe("Araku Valley");
    expect(r.candidateDestinations[0].state).toBe("Andhra Pradesh");
  });

  it("24. resolves a state without collapsing it into one city", async () => {
    const r = await locationResolver.resolve("Sikkim");
    expect(r.locationType).toBe("state");
    expect(r.resolvedState).toBe("Sikkim");
    expect(r.candidateDestinations.length).toBeGreaterThan(1);
    for (const c of r.candidateDestinations) {
      expect(c.state).toBe("Sikkim");
    }
    expect(r.warnings.join(" ")).toMatch(/no single city was assumed/i);
  });

  it("25. resolves a district to destinations within that district", async () => {
    const r = await locationResolver.resolve("Kodagu");
    expect(r.locationType).toBe("district");
    expect(r.resolvedDistrict).toBe("Kodagu");
    expect(r.totalCandidates).toBeGreaterThanOrEqual(2);
  });

  it("26. preserves ambiguity for multi-match partial queries", async () => {
    const r = await locationResolver.resolve("falls");
    expect(r.locationType).toBe("ambiguous");
    expect(r.totalCandidates).toBeGreaterThan(1);
    expect(r.warnings.join(" ")).toMatch(/no single destination was assumed/i);
  });

  it("27. unknown locations return unknown type without fabricated candidates", async () => {
    const r = await locationResolver.resolve("Atlantis");
    expect(r.locationType).toBe("unknown");
    expect(r.candidateDestinations).toHaveLength(0);
  });

  it("28. candidate lists are bounded", async () => {
    const r = await locationResolver.resolve("Kerala");
    expect(r.locationType).toBe("state");
    expect(r.candidateDestinations.length).toBeLessThanOrEqual(8);
    expect(r.totalCandidates).toBeLessThanOrEqual(8);
  });

  it("29. never invents destinations — all candidates come from verified records", async () => {
    const r = await locationResolver.resolve("Rajasthan");
    for (const c of r.candidateDestinations) {
      expect(c.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.state.toLowerCase()).toContain("rajasthan");
    }
  });

  it("30. state-level trip query does NOT silently become one random city", async () => {
    const direct = await new LocationResolver().resolve("Kerala");
    expect(direct.locationType).toBe("state");

    const res = await request(createApp())
      .post("/api/v1/ai/chat")
      .send({ message: "Plan a 3-day trip in Kerala" });
    expect(res.status).toBe(200);
    const lr = res.body.data.locationResolution;
    expect(lr).toBeDefined();
    expect(lr.locationType).toBe("state");
    expect(lr.candidateDestinations.length).toBeGreaterThan(1);
    const warningsJoined = (res.body.data.warnings ?? []).join(" ");
    expect(warningsJoined).toMatch(/no single city was assumed/i);
  }, 45000);

  // =========================================================================
  // AI INTEGRATION & SECURITY (31–35, 39–40)
  // =========================================================================
  it("31. public requests do not load private preferences", async () => {
    const res = await request(createApp())
      .post("/api/v1/ai/chat")
      .send({ message: "What is the best time to visit Araku without crowds?" });
    expect(res.status).toBe(200);
    expect(res.body.data.travellerContext.travellerGroup).toBeNull();
    expect(res.body.data.travellerContext.interests).toEqual([]);
  }, 45000);

  it("32. personalized authenticated requests load stored preferences", async () => {
    const { orchestrator } = buildAuthedOrchestrator();
    const res = await orchestrator.chat("Recommend cultural experiences for me", touristA);
    expect(res.travellerContext).toBeDefined();
    expect(res.travellerContext!.targetLanguage).toBe("te"); // stored preferred_language
  }, 60000);

  it("33. trip-specific requests load existing trip context", async () => {
    const { orchestrator } = buildAuthedOrchestrator();
    const res = await orchestrator.chat("Help me improve my existing trip", touristA);
    expect(res.travellerContext).toBeDefined();
    expect(res.travellerContext!.activeTrip).not.toBeNull();
    expect(res.travellerContext!.activeTrip!.name).toBe("My Existing Araku Trip");
    expect(res.travellerContext!.activeTrip!.itineraryItemCount).toBe(1);
  }, 60000);

  it("34. explicit save persists; normal chat never persists", async () => {
    const { orchestrator, getStoredInterests } = buildAuthedOrchestrator();

    // Normal conversational mention — must NOT persist:
    await orchestrator.chat("I like quiet heritage places in Araku", touristA);
    expect(getStoredInterests()).toEqual([]);

    // Explicit save phrasing — MUST persist:
    const res = await orchestrator.chat("Remember that I prefer cultural experiences", touristA);
    expect(getStoredInterests()).toContain("culture");
    expect((res.warnings ?? []).join(" ")).toMatch(/preference saved/i);
  }, 60000);

  it("35. unauthenticated save attempts never persist", async () => {
    const { orchestrator, getStoredInterests } = buildAuthedOrchestrator();
    const res = await orchestrator.chat("Remember that I prefer cultural experiences");
    expect(getStoredInterests()).toEqual([]);
    expect((res.warnings ?? []).join(" ")).toMatch(/sign in is required/i);
  }, 60000);

  it("40. AI context payload excludes private data", async () => {
    const { orchestrator } = buildAuthedOrchestrator();
    const res = await orchestrator.chat("Recommend places based on my preferences", touristA);
    const serialized = JSON.stringify(res.travellerContext ?? {});
    expect(serialized).not.toMatch(/email|password|token|scopedSupabase|user_id/i);
    expect(serialized).not.toContain(touristA.email!);
  }, 60000);
});
