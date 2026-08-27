import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { authService, AuthService } from "../src/services/auth.service";
import { UserRepository } from "../src/repositories/user.repository";
import { extractBearerToken, requireRole } from "../src/middleware/auth";
import { Request, Response, NextFunction } from "express";
import { AuthenticatedUser } from "../src/types/auth";
import { User } from "@supabase/supabase-js";
import express from "express";
import { errorHandler } from "../src/middleware/errorHandler";

describe("Authentication & RBAC Middleware Suite", () => {
  const app = createApp();

  describe("Token Extraction & Format Verification", () => {
    it("should extract valid bearer token from authorization header", () => {
      const req = {
        headers: { authorization: "Bearer valid-test-token-123" }
      } as unknown as Request;

      const token = extractBearerToken(req);
      expect(token).toBe("valid-test-token-123");
    });

    it("should return null if authorization header is missing or non-bearer", () => {
      expect(extractBearerToken({ headers: {} } as Request)).toBeNull();
      expect(
        extractBearerToken({
          headers: { authorization: "Basic dXNlcjpwYXNz" }
        } as Request)
      ).toBeNull();
      expect(
        extractBearerToken({
          headers: { authorization: "Bearer" }
        } as Request)
      ).toBeNull();
    });
  });

  describe("API Endpoint Security: /api/v1/auth/me", () => {
    it("should reject requests without Authorization header with 401 Unauthorized", async () => {
      const response = await request(app).get("/api/v1/auth/me");

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("success", false);
      expect(response.body.error).toHaveProperty("code", "UNAUTHORIZED");
      expect(response.body.error.message).toContain("Missing or malformed Authorization header");
    });

    it("should reject requests with invalid/malformed Bearer token with 401 Unauthorized", async () => {
      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer invalid-jwt-signature");

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("success", false);
      expect(response.body.error).toHaveProperty("code", "UNAUTHORIZED");
    });

    it("should reject protected role routes without authentication with 401", async () => {
      const touristRes = await request(app).get("/api/v1/auth/verify/tourist");
      expect(touristRes.status).toBe(401);

      const businessRes = await request(app).get("/api/v1/auth/verify/business");
      expect(businessRes.status).toBe(401);

      const adminRes = await request(app).get("/api/v1/auth/verify/admin");
      expect(adminRes.status).toBe(401);
    });
  });

  describe("RBAC Enforcement Middleware", () => {
    const createMockAppWithRole = (user: AuthenticatedUser | undefined) => {
      const mockApp = express();
      mockApp.use(express.json());

      // Inject mock user middleware
      mockApp.use((req: Request, _res: Response, next: NextFunction) => {
        req.user = user;
        next();
      });

      mockApp.get("/test/tourist-only", requireRole("tourist"), (_req, res) => {
        res.json({ success: true, message: "Welcome Tourist" });
      });

      mockApp.get("/test/business-only", requireRole("business"), (_req, res) => {
        res.json({ success: true, message: "Welcome Business" });
      });

      mockApp.get("/test/admin-only", requireRole("admin"), (_req, res) => {
        res.json({ success: true, message: "Welcome Admin" });
      });

      mockApp.use(errorHandler);
      return mockApp;
    };

    it("should grant access when user has the exact required role", async () => {
      const touristApp = createMockAppWithRole({
        id: "usr-1",
        email: "tourist@example.com",
        role: "tourist",
        roles: ["tourist"]
      });

      const response = await request(touristApp).get("/test/tourist-only");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should reject with 403 Forbidden when user has a different role", async () => {
      const touristApp = createMockAppWithRole({
        id: "usr-1",
        email: "tourist@example.com",
        role: "tourist",
        roles: ["tourist"]
      });

      const adminCheck = await request(touristApp).get("/test/admin-only");
      expect(adminCheck.status).toBe(403);
      expect(adminCheck.body.success).toBe(false);
      expect(adminCheck.body.error.code).toBe("FORBIDDEN");
      expect(adminCheck.body.error.message).toContain("Insufficient permissions");

      const businessCheck = await request(touristApp).get("/test/business-only");
      expect(businessCheck.status).toBe(403);
      expect(businessCheck.body.error.code).toBe("FORBIDDEN");
    });

    it("should grant access for admin role on admin routes", async () => {
      const adminApp = createMockAppWithRole({
        id: "adm-1",
        email: "admin@tourism.gov.in",
        role: "admin",
        roles: ["admin"]
      });

      const response = await request(adminApp).get("/test/admin-only");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should grant access when user has multiple roles including the requested one", async () => {
      const multiRoleApp = createMockAppWithRole({
        id: "multi-1",
        email: "dual@example.com",
        role: "tourist",
        roles: ["tourist", "business"]
      });

      const touristRes = await request(multiRoleApp).get("/test/tourist-only");
      expect(touristRes.status).toBe(200);

      const businessRes = await request(multiRoleApp).get("/test/business-only");
      expect(businessRes.status).toBe(200);

      const adminRes = await request(multiRoleApp).get("/test/admin-only");
      expect(adminRes.status).toBe(403);
    });

    it("should reject with 401 Unauthorized if user context is missing during role check", async () => {
      const unauthApp = createMockAppWithRole(undefined);
      const res = await request(unauthApp).get("/test/tourist-only");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("AuthService & Scoped Client Logic", () => {
    it("should create a scoped Supabase client with Authorization header", () => {
      const testToken = "sample-test-token-jwt";
      const client = authService.createScopedClient(testToken);

      expect(client).toBeDefined();
      expect(typeof client.from).toBe("function");
    });

    it("should resolve primary role and fallback properly", async () => {
      const mockUser: User = {
        id: "mock-user-uuid",
        app_metadata: { role: "business" },
        user_metadata: { full_name: "Test Merchant" },
        aud: "authenticated",
        created_at: new Date().toISOString()
      };

      const mockRepo = new UserRepository();
      vi.spyOn(mockRepo, "findRolesByUserId").mockResolvedValue(["business"]);

      const service = new AuthService(mockRepo);
      const scopedClient = service.createScopedClient("dummy-token");
      const context = await service.resolveUserContext(mockUser, scopedClient);

      expect(context.id).toBe("mock-user-uuid");
      expect(context.role).toBe("business");
      expect(context.roles).toEqual(["business"]);
      expect(context.userMetadata?.full_name).toBe("Test Merchant");
    });
  });
});
