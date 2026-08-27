import { describe, it, expect } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { createApp } from "../src/app";
import { gracefulShutdown } from "../src/server";
import { resetRateLimits, rateLimiterStore } from "../src/middleware/rateLimiter";
import { resetCircuitBreakers, circuitBreaker } from "../src/utils/httpClient";

describe("Phase 9D: Release Candidate Audit & Deployment Readiness Invariants", () => {
  const app = createApp();
  const rootDir = path.resolve(__dirname, "..");

  it("1. package.json contains all required lifecycle and release scripts", () => {
    const pkgPath = path.join(rootDir, "package.json");
    expect(fs.existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const required = [
      "build",
      "start",
      "lint",
      "format:check",
      "test",
      "release:check",
      "smoke:test"
    ];
    for (const script of required) {
      expect(pkg.scripts[script]).toBeDefined();
    }
  });

  it("2. package.json specifies Node.js >= 20.0.0 and npm >= 10.0.0 engines", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
    expect(pkg.engines).toBeDefined();
    expect(pkg.engines.node).toBe(">=20.0.0");
    expect(pkg.engines.npm).toBe(">=10.0.0");
  });

  it("3. .env.example defines all configuration placeholders without real secrets", () => {
    const envPath = path.join(rootDir, ".env.example");
    expect(fs.existsSync(envPath)).toBe(true);

    const content = fs.readFileSync(envPath, "utf-8");
    const requiredVars = [
      "PORT",
      "NODE_ENV",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GEMINI_API_KEY"
    ];

    for (const v of requiredVars) {
      expect(content).toContain(v);
    }

    // Zero real credentials or JWT tokens in example
    expect(content).not.toContain("eyJh");
    expect(content).not.toContain("AIzaSy");
  });

  it("4. .gitignore excludes .env, node_modules, and dist", () => {
    const gitignorePath = path.join(rootDir, ".gitignore");
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toContain(".env");
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
  });

  it("5. GitHub Actions workflow .github/workflows/ci.yml is configured with mandatory gates", () => {
    const ciPath = path.join(rootDir, ".github", "workflows", "ci.yml");
    expect(fs.existsSync(ciPath)).toBe(true);

    const content = fs.readFileSync(ciPath, "utf-8");
    expect(content).toContain("actions/checkout@v4");
    expect(content).toContain("actions/setup-node@v4");
    expect(content).toContain("npm ci");
    expect(content).toContain("npm run lint");
    expect(content).toContain("npm run format:check");
    expect(content).toContain("npm test");
    expect(content).toContain("npm run build");
    expect(content).toContain("npm run release:check");
  });

  it("6. GET /health returns operational status and build metadata", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("healthy");
    expect(res.body.data.service).toBe("sih-tourism-backend");
    expect(res.body.data.version).toBe("1.0.0");
    expect(res.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("7. GET /ready checks application readiness and database connectivity", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ready");
    expect(res.body.data.checks.server).toBe("ready");
    expect(res.body.data.checks.database).toBe("connected");
  });

  it("8. GET /health/db checks database health without exposing credentials", async () => {
    const res = await request(app).get("/health/db");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("connected");
    expect(res.body.data.verifiedTable).toBe("destinations");
    expect(res.body.data.recordCount).toBeGreaterThan(0);
    expect(res.body.data.supabase_key).toBeUndefined();
    expect(res.body.data.connection_string).toBeUndefined();
  });

  it("9. gracefulShutdown handler is safely exported for signal termination", () => {
    expect(typeof gracefulShutdown).toBe("function");
  });

  it("10. rate limiter store and circuit breaker handlers are functional", () => {
    expect(typeof resetRateLimits).toBe("function");
    expect(typeof rateLimiterStore.reset).toBe("function");
    expect(typeof resetCircuitBreakers).toBe("function");
    expect(typeof circuitBreaker.isOpen).toBe("function");
  });
});
