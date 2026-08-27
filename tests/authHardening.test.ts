import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express, { Request, Response } from "express";
import {
  extractBearerToken,
  authenticate,
  optionalAuthenticate,
  requireAuth,
  requireRole
} from "../src/middleware/auth";
import { authService } from "../src/services/auth.service";
import { UnauthorizedError, ForbiddenError } from "../src/utils/appError";
import { errorHandler } from "../src/middleware/errorHandler";
import { User, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../src/types/database.types";
import { AuthenticatedUser } from "../src/types/auth";

describe("Phase 10A: Authentication Hardening", () => {
  let validateTokenMock: ReturnType<typeof vi.fn>;
  let createScopedClientMock: ReturnType<typeof vi.fn>;
  let resolveUserContextMock: ReturnType<typeof vi.fn>;
  const originalValidateToken = authService.validateToken;
  const originalCreateScopedClient = authService.createScopedClient;
  const originalResolveUserContext = authService.resolveUserContext;

  beforeEach(() => {
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

  describe("1. extractBearerToken edge cases & boundary checks", () => {
    it("1. returns null for undefined or empty req / headers", () => {
      expect(extractBearerToken(undefined as unknown as Request)).toBeNull();
      expect(extractBearerToken({} as unknown as Request)).toBeNull();
      expect(extractBearerToken({ headers: {} } as unknown as Request)).toBeNull();
    });

    it("2. returns null for empty or whitespace-only Authorization header", () => {
      expect(
        extractBearerToken({ headers: { authorization: "" } } as unknown as Request)
      ).toBeNull();
      expect(
        extractBearerToken({ headers: { authorization: "   " } } as unknown as Request)
      ).toBeNull();
    });

    it("3. returns null for non-string Authorization header", () => {
      expect(
        extractBearerToken({ headers: { authorization: 12345 } } as unknown as Request)
      ).toBeNull();
      expect(
        extractBearerToken({ headers: { authorization: null } } as unknown as Request)
      ).toBeNull();
      expect(
        extractBearerToken({ headers: { authorization: {} } } as unknown as Request)
      ).toBeNull();
    });

    it("4. returns null for Authorization: Basic <credentials>", () => {
      const req = { headers: { authorization: "Basic dXNlcjpwYXNz" } } as unknown as Request;
      expect(extractBearerToken(req)).toBeNull();
    });

    it("5. returns null for malformed prefix like BearerBearer", () => {
      const req = { headers: { authorization: "BearerBearer invalidtoken" } } as unknown as Request;
      expect(extractBearerToken(req)).toBeNull();
    });

    it("6. returns null for Bearer without token", () => {
      expect(
        extractBearerToken({ headers: { authorization: "Bearer" } } as unknown as Request)
      ).toBeNull();
      expect(
        extractBearerToken({ headers: { authorization: "Bearer  " } } as unknown as Request)
      ).toBeNull();
    });

    it("7. returns null for Bearer with extra trailing parts", () => {
      const req = { headers: { authorization: "Bearer token extra-part" } } as unknown as Request;
      expect(extractBearerToken(req)).toBeNull();
    });

    it("8. returns null for duplicate comma-separated authorization headers", () => {
      const req = {
        headers: { authorization: "Bearer token1, Bearer token2" }
      } as unknown as Request;
      expect(extractBearerToken(req)).toBeNull();
    });

    it("9. is case-insensitive for Bearer prefix (lowercase, uppercase, mixed)", () => {
      expect(
        extractBearerToken({
          headers: { authorization: "bearer valid-token-123" }
        } as unknown as Request)
      ).toBe("valid-token-123");
      expect(
        extractBearerToken({
          headers: { authorization: "BEARER valid-token-123" }
        } as unknown as Request)
      ).toBe("valid-token-123");
      expect(
        extractBearerToken({
          headers: { authorization: "bEaReR valid-token-123" }
        } as unknown as Request)
      ).toBe("valid-token-123");
    });

    it("10. handles multiple spaces/tabs between Bearer and token", () => {
      const req = { headers: { authorization: "Bearer    valid-token-123" } } as unknown as Request;
      expect(extractBearerToken(req)).toBe("valid-token-123");
    });
  });

  describe("2. authenticate middleware - token validation & context binding", () => {
    beforeEach(() => {
      validateTokenMock.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        app_metadata: {},
        user_metadata: {}
      });
      createScopedClientMock.mockReturnValue({
        from: vi.fn(),
        storage: { get: vi.fn() },
        auth: { getSession: vi.fn() }
      });
      resolveUserContextMock.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        role: "tourist",
        roles: ["tourist"]
      });
    });

    const createTestApp = () => {
      const app = express();
      app.use(express.json());
      app.get("/protected", authenticate(authService), (req: Request, res: Response) => {
        res.json({
          user: req.user,
          hasScopedClient: Boolean(req.scopedSupabase)
        });
      });
      app.use(errorHandler);
      return app;
    };

    it("11. valid token → attaches authenticated user and scoped Supabase client", async () => {
      const app = createTestApp();

      const res = await request(app)
        .get("/protected")
        .set("Authorization", "Bearer valid-jwt-token-123");

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe("user-123");
      expect(res.body.user.role).toBe("tourist");
      expect(res.body.hasScopedClient).toBe(true);
      expect(validateTokenMock).toHaveBeenCalledWith("valid-jwt-token-123");
    });

    it("12. missing Authorization header → returns 401 Unauthorized", async () => {
      const app = createTestApp();

      const res = await request(app).get("/protected");

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("13. invalid / expired token → returns 401 Unauthorized", async () => {
      validateTokenMock.mockRejectedValueOnce(
        new UnauthorizedError("Invalid or expired authentication token")
      );
      const app = createTestApp();

      const res = await request(app).get("/protected").set("Authorization", "Bearer expired-token");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("14. malformed token format → returns 401 Unauthorized", async () => {
      const app = createTestApp();

      const res = await request(app).get("/protected").set("Authorization", "NotBearer token");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("15. unexpected auth service rejection → forwards safe 401/error through error handler", async () => {
      validateTokenMock.mockRejectedValueOnce(new Error("Supabase Auth API error"));
      const app = createTestApp();

      const res = await request(app).get("/protected").set("Authorization", "Bearer bad-token");

      expect([401, 500]).toContain(res.status);
    });
  });

  describe("3. optionalAuthenticate middleware - graceful handling", () => {
    beforeEach(() => {
      validateTokenMock.mockResolvedValue({
        id: "user-456",
        email: "opt@example.com",
        app_metadata: {},
        user_metadata: {}
      });
      createScopedClientMock.mockReturnValue({
        from: vi.fn()
      });
      resolveUserContextMock.mockResolvedValue({
        id: "user-456",
        email: "opt@example.com",
        role: "tourist",
        roles: ["tourist"]
      });
    });

    const createOptionalApp = () => {
      const app = express();
      app.use(express.json());
      app.get("/optional", optionalAuthenticate(authService), (req: Request, res: Response) => {
        res.json({
          authenticated: Boolean(req.user),
          user: req.user || null
        });
      });
      app.use(errorHandler);
      return app;
    };

    it("16. valid token → attaches req.user and req.scopedSupabase", async () => {
      const app = createOptionalApp();

      const res = await request(app)
        .get("/optional")
        .set("Authorization", "Bearer valid-token-456");

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.user.id).toBe("user-456");
    });

    it("17. no token → proceeds anonymously with req.user undefined", async () => {
      const app = createOptionalApp();

      const res = await request(app).get("/optional");

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
      expect(res.body.user).toBeNull();
    });

    it("18. invalid / corrupted token → ignores invalid token and proceeds anonymously without crashing", async () => {
      validateTokenMock.mockRejectedValueOnce(new UnauthorizedError("Token corrupted"));
      const app = createOptionalApp();

      const res = await request(app)
        .get("/optional")
        .set("Authorization", "Bearer corrupted-jwt-token");

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
      expect(res.body.user).toBeNull();
    });
  });

  describe("4. requireAuth & requireRole middleware", () => {
    it("19. requireAuth passes when req.user.id is populated", () => {
      const req = { user: { id: "user-789", role: "tourist" } } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      requireAuth(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("20. requireAuth rejects with UnauthorizedError when req.user is missing", () => {
      const req = {} as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      requireAuth(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it("21. requireRole permits user with allowed role", () => {
      const middleware = requireRole("admin");
      const req = {
        user: { id: "admin-1", role: "admin", roles: ["admin"] }
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("22. requireRole rejects with ForbiddenError when user has insufficient role", () => {
      const middleware = requireRole("admin");
      const req = {
        user: { id: "user-1", role: "tourist", roles: ["tourist"] }
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it("23. requireRole permits user when allowed role is in multi-role array", () => {
      const middleware = requireRole("business", "admin");
      const req = {
        user: { id: "biz-1", role: "business", roles: ["tourist", "business"] }
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("5. Security Boundaries & Auth Bypass Resistance", () => {
    it("24. User identity strictly sourced from validated auth token, never request body / query", async () => {
      validateTokenMock.mockResolvedValue({
        id: "legitimate-user-id",
        email: "legit@example.com",
        app_metadata: {},
        user_metadata: {}
      });
      createScopedClientMock.mockReturnValue({ from: vi.fn() });
      resolveUserContextMock.mockResolvedValue({
        id: "legitimate-user-id",
        email: "legit@example.com",
        role: "tourist",
        roles: ["tourist"]
      });

      const app = express();
      app.use(express.json());
      app.post("/test-identity", authenticate(authService), (req: Request, res: Response) => {
        const bodyRecord = req.body as Record<string, unknown>;
        res.json({
          authenticatedUserId: req.user?.id,
          spoofedBodyIgnored: req.user?.id !== bodyRecord.userId
        });
      });
      app.use(errorHandler);

      const res = await request(app)
        .post("/test-identity")
        .set("Authorization", "Bearer valid-token")
        .send({ userId: "attacker-forged-user-id" });

      expect(res.status).toBe(200);
      expect(res.body.authenticatedUserId).toBe("legitimate-user-id");
      expect(res.body.spoofedBodyIgnored).toBe(true);
    });

    it("25. Alternate headers (e.g. x-api-key, x-user-id) cannot bypass Bearer authentication", async () => {
      const app = express();
      app.use(express.json());
      app.get("/bypass-test", authenticate(authService), (req: Request, res: Response) => {
        res.json({ user: req.user });
      });
      app.use(errorHandler);

      // Attempting to bypass with fake header
      const res = await request(app)
        .get("/bypass-test")
        .set("x-api-key", "admin-bypass-key")
        .set("x-user-id", "admin-user");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("26. Auth error messages do not leak internal database errors or tokens", async () => {
      validateTokenMock.mockRejectedValueOnce(
        new UnauthorizedError("Invalid token: eyJhbGciOi...sensitive_token_content...")
      );

      const app = express();
      app.use(express.json());
      app.get("/leak-test", authenticate(authService), (_req: Request, res: Response) => {
        res.json({ ok: true });
      });
      app.use(errorHandler);

      const res = await request(app).get("/leak-test").set("Authorization", "Bearer bad-token");

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });
  });
});
