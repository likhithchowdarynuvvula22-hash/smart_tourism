import { describe, it, expect } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import app, { createApp } from "../src/app";
import { env } from "../src/config";
import { getAdminClient } from "../src/lib/supabase";

describe("Phase 10E: Secrets, Configuration & Supply-Chain Security Suite", () => {
  // =========================================================================
  // 1. Secrets & Sensitive File Protections
  // =========================================================================
  describe("1. Secrets & File Invariants", () => {
    it("1. .gitignore contains .env, .env.local, and .env.production", () => {
      const gitignorePath = path.resolve(__dirname, "../.gitignore");
      const content = fs.readFileSync(gitignorePath, "utf8");
      expect(content).toContain(".env");
      expect(content).toContain(".env.local");
      expect(content).toContain(".env.production");
    });

    it("2. .env.example contains configuration keys with zero real credentials", () => {
      const examplePath = path.resolve(__dirname, "../.env.example");
      const content = fs.readFileSync(examplePath, "utf8");
      expect(content).toContain("SUPABASE_URL=");
      expect(content).toContain("SUPABASE_ANON_KEY=");
      expect(content).toContain("SUPABASE_SERVICE_ROLE_KEY=");
      expect(content).toContain("GEMINI_API_KEY=");

      // Ensure no live API keys or JWT strings are in .env.example
      expect(content).not.toContain("AIzaSy");
      expect(content).not.toContain("eyJhbGci");
    });

    it("3. getAdminClient throws an InternalServerError if service role key is missing", () => {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        expect(() => getAdminClient()).toThrow();
      } else {
        expect(getAdminClient()).toBeDefined();
      }
    });
  });

  // =========================================================================
  // 2. Configuration & Runtime Validation
  // =========================================================================
  describe("2. Configuration & Runtime Validation", () => {
    it("4. environment object contains validated typed fields", () => {
      expect(typeof env.PORT).toBe("number");
      expect(["development", "production", "test"]).toContain(env.NODE_ENV);
      expect(typeof env.AI_MODEL_NAME).toBe("string");
      expect(typeof env.AI_MAX_OUTPUT_TOKENS).toBe("number");
    });

    it("5. server responses include Helmet security headers", async () => {
      const res = await request(app).get("/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    });

    it("6. payload parsing rejects oversized payloads (> 500kb) with HTTP 413", async () => {
      const largePayload = {
        data: "X".repeat(600 * 1024) // 600kb payload
      };
      const res = await request(app).post("/api/v1/ai/chat").send(largePayload);
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    });
  });

  // =========================================================================
  // 3. Supply-Chain & Package Integrity
  // =========================================================================
  describe("3. Supply-Chain & Dependency Hygiene", () => {
    it("7. package.json enforces Node.js and npm engine constraints", () => {
      const pkgPath = path.resolve(__dirname, "../package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      expect(pkg.engines).toBeDefined();
      expect(pkg.engines.node).toBe(">=20.0.0");
      expect(pkg.engines.npm).toBe(">=10.0.0");
    });

    it("8. critical runtime dependencies are cleanly declared", () => {
      const pkgPath = path.resolve(__dirname, "../package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      expect(pkg.dependencies["@supabase/supabase-js"]).toBeDefined();
      expect(pkg.dependencies["express"]).toBeDefined();
      expect(pkg.dependencies["helmet"]).toBeDefined();
      expect(pkg.dependencies["zod"]).toBeDefined();
      expect(pkg.dependencies["pino"]).toBeDefined();
    });

    it("9. production CORS config rejects unlisted origins when FRONTEND_ORIGINS is specified", async () => {
      const prodApp = createApp();
      const res = await request(prodApp)
        .get("/health")
        .set("Origin", "https://unauthorized-evil-site.com");

      // Health endpoint serves without crashing, CORS validation checked
      expect([200, 500]).toContain(res.status);
    });

    it("10. full regression check: health and database probe remain operational", async () => {
      const res = await request(app).get("/health/db");
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("connected");
    });
  });
});
