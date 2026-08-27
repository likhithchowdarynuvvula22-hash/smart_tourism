import request from "supertest";
import app from "../src/app";
import { authService } from "../src/services/auth.service";
import { AuthenticatedUser } from "../src/types/auth";
import { resetRateLimits } from "../src/middleware/rateLimiter";

async function runRbacSmokeTests() {
  console.log("==================================================");
  console.log("PHASE 10B LIVE AUTHORIZATION SMOKE TESTS");
  console.log("==================================================");

  const mockTouristA: AuthenticatedUser = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "tourista@example.com",
    role: "tourist",
    roles: ["tourist"]
  };

  const mockBizUser: AuthenticatedUser = {
    id: "33333333-3333-3333-3333-333333333333",
    email: "biz@example.com",
    role: "business",
    roles: ["business"]
  };

  const mockAdmin: AuthenticatedUser = {
    id: "44444444-4444-4444-4444-444444444444",
    email: "admin@example.com",
    role: "admin",
    roles: ["admin"]
  };

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      process.exitCode = 1;
    }
  }

  const originalValidate = authService.validateToken;
  const originalScoped = authService.createScopedClient;
  const originalResolve = authService.resolveUserContext;

  const setAuth = (user: AuthenticatedUser | null) => {
    resetRateLimits();
    if (!user) {
      authService.validateToken = async () => {
        throw new Error("Invalid token");
      };
      return;
    }
    authService.validateToken = async () =>
      ({
        id: user.id,
        email: user.email,
        app_metadata: {},
        user_metadata: {}
      }) as any;
    authService.createScopedClient = (() => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
            maybeSingle: async () => ({ data: null, error: null })
          })
        })
      })
    })) as any;
    authService.resolveUserContext = async () => user;
  };

  try {
    // A. Tourist A -> verify tourist probe
    setAuth(mockTouristA);
    const resA = await request(app)
      .get("/api/v1/auth/verify/tourist")
      .set("Authorization", "Bearer valid-token-a");
    assert(resA.status === 200, "A. Tourist A -> tourist verification returns 200");

    // B. Tourist A -> admin probe (403 expected)
    const resAdminProbe = await request(app)
      .get("/api/v1/auth/verify/admin")
      .set("Authorization", "Bearer valid-token-a");
    assert(resAdminProbe.status === 403, "B. Tourist A -> admin probe rejected with 403");

    // C. Business -> admin probe (403 expected)
    setAuth(mockBizUser);
    const resBizAdmin = await request(app)
      .get("/api/v1/auth/verify/admin")
      .set("Authorization", "Bearer valid-biz-token");
    assert(resBizAdmin.status === 403, "C. Business user -> admin probe rejected with 403");

    // D. Business -> tourist preferences (403 expected)
    const resBizPref = await request(app)
      .get("/api/v1/tourist/preferences")
      .set("Authorization", "Bearer valid-biz-token");
    assert(resBizPref.status === 403, "D. Business user -> tourist preferences rejected with 403");

    // E. Admin -> admin probe (200 expected)
    setAuth(mockAdmin);
    const resAdmin = await request(app)
      .get("/api/v1/auth/verify/admin")
      .set("Authorization", "Bearer valid-admin-token");
    assert(resAdmin.status === 200, "E. Admin user -> admin probe accepted with 200");

    // F. Forged role=admin in body
    setAuth(mockTouristA);
    const resForgedRole = await request(app)
      .get("/api/v1/auth/verify/admin")
      .set("Authorization", "Bearer valid-token-a")
      .send({ role: "admin" });
    assert(resForgedRole.status === 403, "F. Forged role in body is ignored and rejected with 403");

    // G. Header spoofing (X-Role: admin)
    const resSpoofedHeader = await request(app)
      .get("/api/v1/auth/verify/admin")
      .set("Authorization", "Bearer valid-token-a")
      .set("X-Role", "admin");
    assert(
      resSpoofedHeader.status === 403,
      "G. Header spoofing (X-Role) is ignored and rejected with 403"
    );

    // H. Context preview: Tourist A gets own context
    setAuth(mockTouristA);
    const resPreview = await request(app)
      .get("/api/v1/ai/context-preview")
      .set("Authorization", "Bearer valid-token-a");
    assert(
      resPreview.status === 200 && resPreview.body.data.identity.authenticated === true,
      "H. Context preview returns caller's own context"
    );

    console.log("==================================================");
    console.log(`SMOKE TEST RESULTS: ${passed}/${total} PASSED`);
    console.log("==================================================");
  } finally {
    authService.validateToken = originalValidate;
    authService.createScopedClient = originalScoped;
    authService.resolveUserContext = originalResolve;
  }
}

runRbacSmokeTests().catch((err) => {
  console.error("Live RBAC smoke test execution failed:", err);
  process.exit(1);
});
