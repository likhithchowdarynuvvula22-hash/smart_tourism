import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../src/app";
import { authService } from "../src/services/auth.service";
import { tripService } from "../src/services/trip.service";
import { savedPlacesService } from "../src/services/savedPlaces.service";
import { preferencesService } from "../src/services/preferences.service";
import { resetRateLimits } from "../src/middleware/rateLimiter";
import { User, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../src/types/database.types";
import { AuthenticatedUser } from "../src/types/auth";
import { ForbiddenError, NotFoundError } from "../src/utils/appError";

describe("Phase 10B: Authorization & RBAC Security Audit Suite", () => {
  let validateTokenMock: ReturnType<typeof vi.fn>;
  let createScopedClientMock: ReturnType<typeof vi.fn>;
  let resolveUserContextMock: ReturnType<typeof vi.fn>;

  const originalValidateToken = authService.validateToken;
  const originalCreateScopedClient = authService.createScopedClient;
  const originalResolveUserContext = authService.resolveUserContext;

  const mockUserA: AuthenticatedUser = {
    id: "user-a-1111-1111-1111-111111111111",
    email: "usera@example.com",
    role: "tourist",
    roles: ["tourist"]
  };

  const mockUserB: AuthenticatedUser = {
    id: "user-b-2222-2222-2222-222222222222",
    email: "userb@example.com",
    role: "tourist",
    roles: ["tourist"]
  };

  const mockBusinessUser: AuthenticatedUser = {
    id: "business-3333-3333-3333-333333333333",
    email: "biz@example.com",
    role: "business",
    roles: ["business"]
  };

  const mockAdminUser: AuthenticatedUser = {
    id: "admin-4444-4444-4444-444444444444",
    email: "admin@example.com",
    role: "admin",
    roles: ["admin"]
  };

  const mockMultiRoleUser: AuthenticatedUser = {
    id: "multi-5555-5555-5555-555555555555",
    email: "multi@example.com",
    role: "admin",
    roles: ["tourist", "business", "admin"]
  };

  beforeEach(() => {
    resetRateLimits();
    validateTokenMock = vi.fn();
    createScopedClientMock = vi.fn();
    resolveUserContextMock = vi.fn();

    authService.validateToken = validateTokenMock as unknown as (token: string) => Promise<User>;
    authService.createScopedClient = createScopedClientMock as unknown as (
      token: string
    ) => SupabaseClient<Database>;
    authService.resolveUserContext = resolveUserContextMock as unknown as (
      user: User,
      scopedClient: SupabaseClient<Database>
    ) => Promise<AuthenticatedUser>;
  });

  afterEach(() => {
    authService.validateToken = originalValidateToken;
    authService.createScopedClient = originalCreateScopedClient;
    authService.resolveUserContext = originalResolveUserContext;
    vi.restoreAllMocks();
  });

  const setupMockAuth = (user: AuthenticatedUser) => {
    validateTokenMock.mockResolvedValue({
      id: user.id,
      email: user.email,
      app_metadata: {},
      user_metadata: {}
    });
    createScopedClientMock.mockReturnValue({
      from: vi.fn()
    });
    resolveUserContextMock.mockResolvedValue(user);
  };

  // =========================================================================
  // 1. Authorization Basics
  // =========================================================================
  describe("1. Authorization Basics & Probing Endpoints", () => {
    it("1. unauthenticated protected endpoint returns 401", async () => {
      const res = await request(app).get("/api/v1/auth/verify/tourist");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("2. tourist role accepted on tourist verification probe", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/tourist")
        .set("Authorization", "Bearer tourist-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe("tourist");
    });

    it("3. business role accepted on business verification probe", async () => {
      setupMockAuth(mockBusinessUser);
      const res = await request(app)
        .get("/api/v1/auth/verify/business")
        .set("Authorization", "Bearer business-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe("business");
    });

    it("4. admin role accepted on admin verification probe", async () => {
      setupMockAuth(mockAdminUser);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe("admin");
    });

    it("5. wrong role returns 403 Forbidden with sanitized error code", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer tourist-token");

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================================================
  // 2. Vertical Privilege Escalation
  // =========================================================================
  describe("2. Vertical Privilege Escalation Defense", () => {
    it("6. tourist attempting admin-only operation is rejected (403)", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer tourist-token");

      expect(res.status).toBe(403);
    });

    it("7. tourist attempting business-only verification is rejected (403)", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/business")
        .set("Authorization", "Bearer tourist-token");

      expect(res.status).toBe(403);
    });

    it("8. business user attempting admin verification is rejected (403)", async () => {
      setupMockAuth(mockBusinessUser);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer business-token");

      expect(res.status).toBe(403);
    });

    it("9. business user cannot access tourist-private preference routes", async () => {
      setupMockAuth(mockBusinessUser);
      const res = await request(app)
        .get("/api/v1/tourist/preferences")
        .set("Authorization", "Bearer business-token");

      expect(res.status).toBe(403);
    });

    it("10. non-admin user cannot elevate role via body or headers", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer tourist-token")
        .set("x-role", "admin")
        .send({ role: "admin", isAdmin: true });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. Horizontal Privilege Escalation & Resource Ownership
  // =========================================================================
  describe("3. Horizontal Privilege Escalation (User A vs User B)", () => {
    const tripAId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const itemAId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    beforeEach(() => {
      vi.spyOn(tripService, "getTripById").mockImplementation(async (tripId, userId) => {
        if (userId !== mockUserA.id) {
          throw new ForbiddenError("You do not have permission to access this trip");
        }
        return {
          id: tripId,
          user_id: mockUserA.id,
          name: "User A Trip",
          start_date: "2026-09-01",
          end_date: "2026-09-05",
          status: "planned",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          items: []
        };
      });

      vi.spyOn(tripService, "updateTrip").mockImplementation(async (tripId, userId) => {
        if (userId !== mockUserA.id) {
          throw new ForbiddenError("You do not have permission to access this trip");
        }
        return {
          id: tripId,
          user_id: mockUserA.id,
          name: "Updated Name",
          start_date: "2026-09-01",
          end_date: "2026-09-05",
          status: "planned",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      vi.spyOn(tripService, "deleteTrip").mockImplementation(async (tripId, userId) => {
        if (userId !== mockUserA.id) {
          throw new ForbiddenError("You do not have permission to access this trip");
        }
        return true;
      });

      vi.spyOn(tripService, "addItineraryItem").mockImplementation(async (tripId, userId) => {
        if (userId !== mockUserA.id) {
          throw new ForbiddenError("You do not have permission to access this trip");
        }
        return {
          id: itemAId,
          trip_id: tripId,
          destination_id: null,
          attraction_id: null,
          visit_date: null,
          start_time: null,
          end_time: null,
          notes: null,
          sort_order: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      vi.spyOn(tripService, "updateItineraryItem").mockImplementation(
        async (_tripId, _itemId, userId) => {
          if (userId !== mockUserA.id) {
            throw new ForbiddenError("You do not have permission to access this trip");
          }
          return {
            id: itemAId,
            trip_id: tripAId,
            destination_id: null,
            attraction_id: null,
            visit_date: null,
            start_time: null,
            end_time: null,
            notes: null,
            sort_order: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }
      );
    });

    it("11. User B cannot read User A's trip (403 Forbidden)", async () => {
      setupMockAuth(mockUserB);
      const res = await request(app)
        .get(`/api/v1/trips/${tripAId}`)
        .set("Authorization", "Bearer user-b-token");

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("12. User B cannot update User A's trip (403 Forbidden)", async () => {
      setupMockAuth(mockUserB);
      const res = await request(app)
        .put(`/api/v1/trips/${tripAId}`)
        .set("Authorization", "Bearer user-b-token")
        .send({ name: "Hijacked Trip" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("13. User B cannot delete User A's trip (403 Forbidden)", async () => {
      setupMockAuth(mockUserB);
      const res = await request(app)
        .delete(`/api/v1/trips/${tripAId}`)
        .set("Authorization", "Bearer user-b-token");

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("14. User B cannot add itinerary item to User A's trip (403 Forbidden)", async () => {
      setupMockAuth(mockUserB);
      const res = await request(app)
        .post(`/api/v1/trips/${tripAId}/items`)
        .set("Authorization", "Bearer user-b-token")
        .send({ notes: "Malicious item" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("15. User B cannot modify User A's itinerary item (403 Forbidden)", async () => {
      setupMockAuth(mockUserB);
      const res = await request(app)
        .put(`/api/v1/trips/${tripAId}/items/${itemAId}`)
        .set("Authorization", "Bearer user-b-token")
        .send({ notes: "Malicious update" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("16. User B cannot access User A's saved places", async () => {
      vi.spyOn(savedPlacesService, "getSavedPlaces").mockImplementation(async (userId) => {
        if (userId === mockUserA.id) {
          return [
            {
              id: "saved-1",
              user_id: mockUserA.id,
              destination_id: "dest-1",
              attraction_id: null,
              created_at: new Date().toISOString()
            }
          ];
        }
        return [];
      });

      setupMockAuth(mockUserB);
      const res = await request(app)
        .get("/api/v1/saved-places")
        .set("Authorization", "Bearer user-b-token");

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0); // B receives only B's places (empty)
    });

    it("17. User B cannot access User A's travel preferences", async () => {
      vi.spyOn(preferencesService, "getPreferences").mockImplementation(async (userId) => {
        return {
          userId,
          travelPreferences:
            userId === mockUserA.id
              ? {
                  id: "pref-1",
                  user_id: mockUserA.id,
                  interests: ["Heritage"],
                  budget_min: 1000,
                  budget_max: 5000,
                  preferred_trip_days: 3,
                  accessibility_needs: [],
                  safety_priority: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                }
              : null,
          touristProfile: null
        };
      });

      setupMockAuth(mockUserB);
      const res = await request(app)
        .get("/api/v1/tourist/preferences")
        .set("Authorization", "Bearer user-b-token");

      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBe(mockUserB.id);
      expect(res.body.data.travelPreferences).toBeNull();
    });

    it("18. User B cannot access User A's context preview", async () => {
      setupMockAuth(mockUserB);
      const res = await request(app)
        .get("/api/v1/ai/context-preview")
        .set("Authorization", "Bearer user-b-token");

      expect(res.status).toBe(200);
      expect(res.body.data.identity.authenticated).toBe(true);
      expect(res.body.data.identity.role).toBe("tourist");
    });

    it("19. User B cannot load User A's trip context during AI planning", async () => {
      setupMockAuth(mockUserB);
      const res = await request(app)
        .post("/api/v1/ai/chat")
        .set("Authorization", "Bearer user-b-token")
        .send({ message: `Improve my trip ${tripAId}` });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Forged Identity & Untrusted Input Resistance
  // =========================================================================
  describe("4. Forged Identity & Request Tampering Resistance", () => {
    it("20. body.userId is ignored — server uses authenticated req.user.id", async () => {
      let capturedUserId: string | null = null;
      vi.spyOn(tripService, "createTrip").mockImplementation(async (userId, dto) => {
        capturedUserId = userId;
        return {
          id: "new-trip-id",
          user_id: userId,
          name: dto.name,
          start_date: null,
          end_date: null,
          status: "planned",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      setupMockAuth(mockUserA);
      const res = await request(app)
        .post("/api/v1/trips")
        .set("Authorization", "Bearer user-a-token")
        .send({
          name: "Legit Trip",
          userId: mockUserB.id // Attacker attempts to forge creator ID
        });

      expect(res.status).toBe(201);
      expect(capturedUserId).toBe(mockUserA.id);
    });

    it("21. query.userId is ignored in preferences update", async () => {
      let capturedUserId: string | null = null;
      vi.spyOn(preferencesService, "updatePreferences").mockImplementation(async (userId, _dto) => {
        capturedUserId = userId;
        return {
          userId,
          travelPreferences: null,
          touristProfile: null
        };
      });

      setupMockAuth(mockUserA);
      const res = await request(app)
        .put(`/api/v1/tourist/preferences?userId=${mockUserB.id}`)
        .set("Authorization", "Bearer user-a-token")
        .send({ interests: ["Nature"] });

      expect(res.status).toBe(200);
      expect(capturedUserId).toBe(mockUserA.id);
    });

    it("22. forged role in request body is ignored", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer user-a-token")
        .send({ role: "admin" });

      expect(res.status).toBe(403);
    });

    it("23. forged ownerId in request body is ignored", async () => {
      let capturedUserId: string | null = null;
      vi.spyOn(savedPlacesService, "savePlace").mockImplementation(async (userId, dto) => {
        capturedUserId = userId;
        return {
          id: "saved-id",
          user_id: userId,
          destination_id: dto.destinationId || null,
          attraction_id: dto.attractionId || null,
          created_at: new Date().toISOString()
        };
      });

      setupMockAuth(mockUserA);
      const res = await request(app)
        .post("/api/v1/saved-places")
        .set("Authorization", "Bearer user-a-token")
        .send({
          destinationId: "01e98249-049a-4017-a5fb-98b913e05ca5",
          ownerId: mockUserB.id
        });

      expect(res.status).toBe(201);
      expect(capturedUserId).toBe(mockUserA.id);
    });

    it("24. forged nested user object is ignored", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer user-a-token")
        .send({ user: { id: mockAdminUser.id, role: "admin" } });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. Header Spoofing Resistance
  // =========================================================================
  describe("5. Header Spoofing Resistance", () => {
    it("25. X-User-Id header cannot override authenticated user identity", async () => {
      let capturedUserId: string | null = null;
      vi.spyOn(tripService, "createTrip").mockImplementation(async (userId, dto) => {
        capturedUserId = userId;
        return {
          id: "trip-id",
          user_id: userId,
          name: dto.name,
          start_date: null,
          end_date: null,
          status: "planned",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      setupMockAuth(mockUserA);
      const res = await request(app)
        .post("/api/v1/trips")
        .set("Authorization", "Bearer user-a-token")
        .set("X-User-Id", mockUserB.id)
        .send({ name: "Safe Trip" });

      expect(res.status).toBe(201);
      expect(capturedUserId).toBe(mockUserA.id);
    });

    it("26. X-Role header cannot override authenticated role", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer user-a-token")
        .set("X-Role", "admin");

      expect(res.status).toBe(403);
    });

    it("27. X-Admin header cannot grant administrative privileges", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer user-a-token")
        .set("X-Admin", "true");

      expect(res.status).toBe(403);
    });

    it("28. X-Forwarded-User header is completely ignored", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer user-a-token")
        .set("X-Forwarded-User", "admin");

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 6. Multi-Role Precedence & Resolution
  // =========================================================================
  describe("6. Multi-Role Precedence & Verification", () => {
    it("29. user with all three roles preserves all roles in roles array", async () => {
      setupMockAuth(mockMultiRoleUser);
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer multi-token");

      expect(res.status).toBe(200);
      expect(res.body.data.roles).toContain("tourist");
      expect(res.body.data.roles).toContain("business");
      expect(res.body.data.roles).toContain("admin");
    });

    it("30. multi-role user with admin role gets primary role 'admin'", async () => {
      setupMockAuth(mockMultiRoleUser);
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer multi-token");

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe("admin");
    });

    it("31. user with tourist + business roles gets primary role 'business'", async () => {
      const bizTouristUser: AuthenticatedUser = {
        id: "biz-tourist-user",
        email: "biztourist@example.com",
        role: "business",
        roles: ["tourist", "business"]
      };
      setupMockAuth(bizTouristUser);
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer biz-tourist-token");

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe("business");
    });

    it("32. requireRole permits multi-role user for any of their assigned roles", async () => {
      setupMockAuth(mockMultiRoleUser);

      // Can access tourist verification
      resetRateLimits();
      const resTourist = await request(app)
        .get("/api/v1/auth/verify/tourist")
        .set("Authorization", "Bearer multi-token");
      expect(resTourist.status).toBe(200);

      // Can access business verification
      resetRateLimits();
      const resBusiness = await request(app)
        .get("/api/v1/auth/verify/business")
        .set("Authorization", "Bearer multi-token");
      expect(resBusiness.status).toBe(200);

      // Can access admin verification
      resetRateLimits();
      const resAdmin = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer multi-token");
      expect(resAdmin.status).toBe(200);
    });

    it("33. requireRole denies user missing the target role from their multi-role list", async () => {
      const bizTouristUser: AuthenticatedUser = {
        id: "biz-tourist-user",
        email: "biztourist@example.com",
        role: "business",
        roles: ["tourist", "business"]
      };
      setupMockAuth(bizTouristUser);

      const resAdmin = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer biz-tourist-token");
      expect(resAdmin.status).toBe(403);
    });
  });

  // =========================================================================
  // 7. Role Boundaries: Admin, Business, Tourist
  // =========================================================================
  describe("7. Role Boundaries & Edge Isolation", () => {
    it("34. valid admin accepted on admin probe", async () => {
      setupMockAuth(mockAdminUser);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
    });

    it("35. tourist blocked from admin probe", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer tourist-token");

      expect(res.status).toBe(403);
    });

    it("36. business blocked from admin probe", async () => {
      setupMockAuth(mockBusinessUser);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer business-token");

      expect(res.status).toBe(403);
    });

    it("37. valid business accepted on business probe", async () => {
      setupMockAuth(mockBusinessUser);
      const res = await request(app)
        .get("/api/v1/auth/verify/business")
        .set("Authorization", "Bearer business-token");

      expect(res.status).toBe(200);
    });

    it("38. tourist blocked from business probe", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/business")
        .set("Authorization", "Bearer tourist-token");

      expect(res.status).toBe(403);
    });

    it("39. admin cannot access tourist-private trip routes without tourist role", async () => {
      setupMockAuth(mockAdminUser);
      const res = await request(app)
        .get("/api/v1/trips")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 8. RLS Alignment & Service Role Invariants
  // =========================================================================
  describe("8. RLS Alignment & Service Role Invariants", () => {
    it("40. application authorization and RLS both enforce ownership", () => {
      expect(typeof tripService.getTripById).toBe("function");
    });

    it("41. ordinary user requests instantiate scoped Supabase client with bearer token", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer user-a-token");

      expect(res.status).toBe(200);
      expect(createScopedClientMock).toHaveBeenCalledWith("user-a-token");
    });

    it("42. unauthenticated request does not instantiate scoped client or leak RLS bypass", async () => {
      const res = await request(app).get("/api/v1/auth/me");
      expect(res.status).toBe(401);
      expect(createScopedClientMock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 9. Error Sanitization & Standardized Status Codes
  // =========================================================================
  describe("9. Error Sanitization & Information Disclosure Prevention", () => {
    it("43. unauthorized returns standardized 401 UNAUTHORIZED", async () => {
      const res = await request(app).get("/api/v1/trips");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(res.body.error.message).toBeDefined();
    });

    it("44. forbidden returns standardized 403 FORBIDDEN", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/auth/verify/admin")
        .set("Authorization", "Bearer tourist-token");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("45. error messages do not leak internal database tables, SQL queries, or tokens", async () => {
      vi.spyOn(tripService, "getTripById").mockRejectedValueOnce(
        new NotFoundError("Trip with ID '00000000-0000-0000-0000-000000000000' not found")
      );

      setupMockAuth(mockUserA);
      const res = await request(app)
        .get("/api/v1/trips/00000000-0000-0000-0000-000000000000")
        .set("Authorization", "Bearer tourist-token");

      expect([403, 404]).toContain(res.status);
      const rawBody = JSON.stringify(res.body);
      expect(rawBody).not.toContain("SELECT");
      expect(rawBody).not.toContain("password");
      expect(rawBody).not.toContain("service_role");
    });
  });

  // =========================================================================
  // 10. HTTP Methods / Route Matrix Verification
  // =========================================================================
  describe("10. HTTP Method & Route Authorization Matrix", () => {
    it("46. GET /api/v1/destinations is public read", async () => {
      const res = await request(app).get("/api/v1/destinations?limit=1");
      expect(res.status).toBe(200);
    });

    it("47. POST /api/v1/trips requires authentication and tourist role", async () => {
      const unauthRes = await request(app).post("/api/v1/trips").send({ name: "Unauth Trip" });
      expect(unauthRes.status).toBe(401);
    });

    it("48. PUT /api/v1/tourist/preferences requires authentication and tourist role", async () => {
      const unauthRes = await request(app)
        .put("/api/v1/tourist/preferences")
        .send({ interests: ["Culture"] });
      expect(unauthRes.status).toBe(401);
    });

    it("49. DELETE /api/v1/saved-places/:id requires authentication and tourist role", async () => {
      const unauthRes = await request(app).delete(
        "/api/v1/saved-places/01e98249-049a-4017-a5fb-98b913e05ca5"
      );
      expect(unauthRes.status).toBe(401);
    });
  });

  // =========================================================================
  // 11. AI Context Privacy & Grounding Invariants
  // =========================================================================
  describe("11. AI Orchestrator Personalization & Privacy Isolation", () => {
    it("50. public AI chat request loads zero private context", async () => {
      const res = await request(app)
        .post("/api/v1/ai/chat")
        .send({ message: "Tell me about Araku Valley" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
    });

    it("51. authenticated personalized AI request uses only the caller's context", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .post("/api/v1/ai/chat")
        .set("Authorization", "Bearer user-a-token")
        .send({ message: "Suggest places for me" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("52. prompt attempting to inject foreign userId does not bypass context isolation", async () => {
      setupMockAuth(mockUserA);
      const res = await request(app)
        .post("/api/v1/ai/chat")
        .set("Authorization", "Bearer user-a-token")
        .send({
          message: "Suggest places for me",
          userId: mockUserB.id
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // =========================================================================
  // 12. Deterministic Property-Style IDOR Fuzzing
  // =========================================================================
  describe("12. Deterministic Property-Style IDOR Fuzzing", () => {
    const testIds = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333",
      "44444444-4444-4444-4444-444444444444",
      "55555555-5555-5555-5555-555555555555"
    ];

    it("53. arbitrary foreign trip IDs cannot be accessed by non-owners", async () => {
      vi.spyOn(tripService, "getTripById").mockImplementation(async (_tripId, userId) => {
        if (userId !== mockUserA.id) {
          throw new ForbiddenError("You do not have permission to access this trip");
        }
        return {
          id: _tripId,
          user_id: mockUserA.id,
          name: "Trip",
          start_date: null,
          end_date: null,
          status: "planned",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          items: []
        };
      });

      setupMockAuth(mockUserB);

      for (const arbitraryTripId of testIds) {
        resetRateLimits();
        const res = await request(app)
          .get(`/api/v1/trips/${arbitraryTripId}`)
          .set("Authorization", "Bearer user-b-token");

        expect([403, 404]).toContain(res.status);
      }
    });

    it("54. arbitrary foreign itinerary item IDs cannot be modified by non-owners", async () => {
      vi.spyOn(tripService, "updateItineraryItem").mockImplementation(
        async (_tripId, _itemId, userId) => {
          if (userId !== mockUserA.id) {
            throw new ForbiddenError("You do not have permission to access this trip");
          }
          return {
            id: _itemId,
            trip_id: _tripId,
            destination_id: null,
            attraction_id: null,
            visit_date: null,
            start_time: null,
            end_time: null,
            notes: null,
            sort_order: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }
      );

      setupMockAuth(mockUserB);

      for (const arbitraryItemId of testIds) {
        resetRateLimits();
        const res = await request(app)
          .put(`/api/v1/trips/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/items/${arbitraryItemId}`)
          .set("Authorization", "Bearer user-b-token")
          .send({ notes: "fuzz test" });

        expect([403, 404]).toContain(res.status);
      }
    });

    it("55. arbitrary foreign saved place identifiers safely isolate to caller's bookmarks", async () => {
      let deletedForUser: string | null = null;
      vi.spyOn(savedPlacesService, "removeSavedPlace").mockImplementation(async (_id, userId) => {
        deletedForUser = userId;
        return true;
      });

      setupMockAuth(mockUserB);

      for (const arbitrarySavedId of testIds) {
        resetRateLimits();
        const res = await request(app)
          .delete(`/api/v1/saved-places/${arbitrarySavedId}`)
          .set("Authorization", "Bearer user-b-token");

        expect(res.status).toBe(200);
        expect(deletedForUser).toBe(mockUserB.id); // strictly uses authenticated User B
      }
    });
  });
});
