# Secrets, Configuration & Supply-Chain Security Architecture

## 1. Secrets Management & Lifecycle

The platform strictly segregates secrets and runtime configuration from the codebase:

| Secret / Config Key | Purpose | Storage & Ingestion | Access Boundary | Exposure Policy |
| :--- | :--- | :--- | :--- | :--- |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Server-side admin tasks & seed operations | Environment variable (`.env`) | Server-side only via `getAdminClient()` | **CRITICAL**: Never exposed to client, logs, or LLMs |
| **`SUPABASE_ANON_KEY`** | Public database PostgREST access under RLS | Environment variable (`.env`) | Standard `supabase` client singleton | Client-facing safe (bound by RLS) |
| **`GEMINI_API_KEY`** | AI Synthesis & Itinerary Planning | Environment variable (`.env`) | `gemini.provider.ts` HTTP headers only | Redacted in Pino logs; masked in URLs |
| **`JWT Secrets / Tokens`** | User session authentication | Supabase Auth infrastructure | Validated via `authService.validateToken` | Stripped from logs; never stored plaintext |

---

## 2. Configuration & Schema Validation

Configuration is parsed and validated at application startup using **Zod** in [src/config/env.ts](file:///c:/SIH/Coding/src/config/env.ts):

```typescript
const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  CORS_ORIGIN: z.string().default("*"),
  FRONTEND_ORIGINS: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  AI_MODEL_NAME: z.string().default("gemini-1.5-flash"),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().default(2048)
});
```

- **Fail-Fast Policy**: If required variables fail schema validation, the process exits immediately with an explicit configuration error.
- **Development Fallbacks**: Optional keys default to safe fallbacks (e.g. deterministic grounded fallback if `GEMINI_API_KEY` is omitted).

---

## 3. Supply-Chain & Dependency Security

- **Automated Vulnerability Scans**: `npm audit` is integrated into CI/CD quality gates, requiring **0 vulnerabilities** before any release.
- **Lockfile Hygiene**: `package-lock.json` pins exact dependency trees to prevent drift or malicious upstream injections.
- **Engine Verification**: Node.js $\ge 20.0.0$ and npm $\ge 10.0.0$ enforced in `package.json`.
- **Runtime Dependency Minimization**: Production runtime dependencies are strictly limited to vetted libraries (`@supabase/supabase-js`, `express`, `cors`, `helmet`, `pino`, `zod`, `dotenv`).

---

## 4. HTTP Security Headers & Protocol Protection

- **Helmet**: Injected at the top of Express middleware stack to apply `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and `Strict-Transport-Security`.
- **CORS Protection**: In production, CORS is restricted to validated `FRONTEND_ORIGINS`. Wildcards (`*`) are disallowed for production deployments.
- **Body Parser Limits**: Strict `500kb` upper bound on JSON and URL-encoded payloads to prevent buffer exhaustion and memory denial of service.
- **Secret Redaction**: Pino logging and `httpClient` URL masking automatically redact API keys, tokens, and authorization headers across all endpoints.
