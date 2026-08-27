# SIH Smart Tourism Backend - Operational Runbook

## Overview

This runbook provides operational guidance for the SIH Smart Tourism Platform backend (v1.0.0). It is designed to be actionable for someone who did NOT write the code.

---

## 1. Incident Detection

**How incidents are detected:**

- Automated health checks: `/health`, `/health/db`, `/ready` endpoints
- Monitoring dashboards (see dashboard specification)
- Alert conditions (see alerting specification)
- User-reported issues via support channels

**First signs of an incident:**

- `/health` returns non-200 status
- `/health/db` returns 503 or "disconnected"
- `/ready` returns 503 or "not_ready"
- Sudden increase in 5xx error rate via dashboards
- Pager/Slack alert triggered by alert conditions
- User reports of degraded or unavailable service

---

## 2. Initial Triage

**Step-by-step initial triage:**

1. Check `/health` - Verify the application process is running
2. Check `/health/db` - Verify database connectivity
3. Check `/ready` - Verify application readiness to serve traffic
4. Note the response status codes and body data
5. Record the X-Request-Id from the failing request (if applicable)
6. Check recent logs for error patterns

**Expected responses:**

| Endpoint | Expected (normal) | Concerning |
|----------|-------------------|------------|
| `/health` | 200, status: "healthy" | Any other status |
| `/health/db` | 200, status: "connected" | 503 or "disconnected" |
| `/ready` | 200, status: "ready" | 503 or "not_ready" |

---

## 3. Health Checks

**Perform these checks in order:**

1. **`GET /health`**

   - Verifies: Application process is running
   - Returns: status, environment, uptimeSeconds, timestamp, service, version
   - Action if unhealthy: Proceed to /health/db and /ready checks

2. **`GET /health/db`**

   - Verifies: Supabase database connectivity
   - Returns: status, verifiedTable, recordCount, latencyMs
   - Action if unhealthy: Database outage procedure (see Section 20)

3. **`GET /ready`**

   - Verifies: Application can serve required traffic
   - Returns: status, checks (server, database), timestamp
   - Action if unavailable: Service is not ready to receive traffic

**During different outage scenarios:**

- **Database outage:** /health/db returns 503, /ready returns 503, /health returns 200
- **External provider outage:** /health and /health/db return 200, /ready may return 200 (if DB is fine)
- **AI provider outage:** /health, /health/db, /ready all return 200 (AI is non-critical for basic operations)

---

## 4. Readiness Checks

**`GET /ready` verifies:**

- Server process is running: checks.server = "ready"
- Database connectivity: checks.database = "connected"

**If /ready returns 503:**

- Verify /health/db status
- Check for external provider failures
- Check circuit breaker states
- Check rate-limit violations
- Consult logs for error patterns
- Refer to Section 20 (Database Incident Runbook) if DB-related
- Refer to Section 21 (External Provider Incident Runbook) if provider-related

---

## 5. Log Investigation

**How to investigate logs:**

1. Locate recent application logs (Pino structured logs)
2. Look for entries with the X-Request-Id from the failing request
3. Filter by log level: start with ERROR, then WARN
4. Identify the source of the error (request processing, external provider, AI provider, database)
5. Look for patterns: same error code, same provider, same route

**What to look for in logs:**

- `requestId` - Trace the specific request
- `method` + `url` - Which endpoint was called
- `status` - Response status code
- `durationMs` - How long the request took
- `errorCode` - Normalized error category
- `provider` - Which external provider was called
- `service` - Which service component
- `ip` - Client IP (aggregated, not for individual tracking)

**What NOT to look for (privacy):**

- JWTs, passwords, API keys (these are redacted by logger configuration)
- Full AI prompts (sanitized from logs)
- Private user preferences or trip details
- Raw error strings with unbounded cardinality

---

## 6. Request ID Tracing

**Using X-Request-Id to trace requests:**

1. The `X-Request-Id` header is set on every incoming request
2. It is also included in structured log entries
3. To trace a specific request:

   - Obtain the X-Request-Id from the request (client or server log)
   - Search logs for matching `requestId` field
   - Follow the request lifecycle from entry to completion
   - Track external provider operations via requestId-correlated logs
   - Track AI/tool execution via requestId-correlated logs

4. The response includes `X-Request-Id` header for client-side correlation

**Example:** If a request with `X-Request-Id: abc-123-xyz` fails:

```
# Search logs for requestId abc-123-xyz
# Trace: method -> route -> status -> duration -> provider calls -> AI calls -> tool execution
```

---

## 7. Database Investigation

**Safe response when Supabase fails:**

1. Verify `/health/db` - confirm the database connectivity status
2. Inspect error category from error handler (DATABASE_ERROR, etc.)
3. Confirm whether the outage is global (affecting all users) or isolated
4. **Do NOT run destructive queries** - this preserves existing data
5. Preserve existing data - do not attempt schema modifications
6. Wait for provider recovery where appropriate
7. Verify `/health/db` again after recovery
8. Verify `/ready` again after recovery
9. Run non-destructive smoke test (e.g., `GET /health`, `GET /health/db`, `GET /ready`)

**Never instruct operators to disable RLS.** RLS policies are strictly intact across all 36 tables.

**Database outage procedure:**

- If `/health/db` returns 503 or "disconnected":
  - The service continues in degraded mode (non-critical features may be unavailable)
  - Critical destination data may be unavailable
  - AI orchestration may fall back to deterministic provider
  - Wait for Supabase recovery - do not attempt workarounds
  - Monitor `/health/db` for recovery
  - If outage persists, consider rollback (see Section 23)

---

## 8. External Provider Investigation

**For each external provider, investigate:**

### Weather (Open-Meteo)

1. Verify provider status - check if Open-Meteo API is reachable
2. Inspect circuit breaker state (see circuit-breaker investigation)
3. Confirm fallback behavior - weather data should be optional; itineraries continue without fabricated weather
4. Verify itinerary continues without fabricated weather metrics
5. Check weather cache status - cached data may still be valid (1-minute TTL)

**Expected behavior when weather provider is unavailable:**

- Itineraries generate without weather data
- User receives notice that live weather is unavailable
- Baseline/crowd data continues to work from database

### Routing (OSRM)

1. Verify route provider - check if OSRM server is reachable
2. Check unavailable routes - certain route calculations may fail
3. Verify no fabricated distances - routing data is grounded in database

**Expected behavior when routing provider is unavailable:**

- Route calculations may return errors or fallbacks
- Inter-city travel data may be unavailable
- User receives notice that routing data is unavailable

### Translation (MyMemory)

1. Verify provider - check if translation service is reachable
2. Confirm original-text fallback - untranslated text used when translation fails

**Expected behavior when translation provider is unavailable:**

- Untranslated content used as fallback
- No fabricated translations

### Gemini AI

1. Verify provider - check if Gemini API is reachable
2. Confirm deterministic fallback - deterministic AI provider acts as fallback

**Expected behavior when Gemini AI is unavailable:**

- Deterministic AI provider generates grounded responses
- Core functionality continues without generative AI
- Some features (e.g., creative summaries) may be limited

---

## 9. AI Provider Investigation

**When AI provider failures occur:**

1. Check if /health, /health/db, /ready are still 200 (AI is non-critical)
2. Observe if deterministic fallback is being used
3. Check logs for "Primary AI provider call failed" messages
4. Check if fallback provider latency is acceptable
5. Verify AI response quality with deterministic fallback

**AI fallback behavior:**

- If Gemini AI call fails, the orchestrator automatically falls back to the deterministic provider
- Deterministic provider generates grounded responses from verified database records
- Some features may have reduced capability (e.g., no real-time generation)
- Core trip planning, destination queries, and safety information continue to work

---

## 10. Rate-Limit Investigation

**When rate-limit violations (429) are observed:**

1. Check the volume of 429 responses vs. normal baseline
2. Identify the endpoint/category experiencing violations
3. Check the Retry-After header value
4. Determine if this is normal traffic spikes or possible abuse
5. Check rate-limit store for patterns (per category, per IP if applicable)

**Rate-limit investigation steps:**

- Review recent rate-limit events in logs
- Check if violations are isolated to one category (e.g., AI_REQUEST) or widespread
- VerifyRetry-After headers are being returned correctly
- If sudden spike: check for increased legitimate traffic or possible abuse
- If sustained increase: review traffic patterns and consider threshold adjustments

**Do NOT treat a small number of normal 429 responses as automatically indicative of an attack.** Some 429s are expected under normal rate-limit policies.

---

## 11. Circuit-Breaker Investigation

**When circuit breakers enter OPEN state:**

1. Identify which provider's circuit breaker is OPEN
2. Check how many consecutive failures triggered the opening (threshold = 5)
3. Check the cooldown period (30 seconds before HALF_OPEN transition)
4. Verify if the provider has recovered during HALF_OPEN state
5. Check logs for circuit tripped warnings

**Alert conditions for circuit breakers:**

- **WARNING:** One provider repeatedly enters OPEN state
- **CRITICAL:** Multiple external providers fail simultaneously
- **CRITICAL:** Required core dependency remains unavailable unusually long

**Do NOT page operators for every transient failure.** Circuit breakers are designed to handle transient failures automatically. Only alert when a provider remains OPEN across multiple cooldown cycles.

---

## 12. Recovery Steps

**General recovery procedure:**

1. Identify the root cause from logs, metrics, and triage
2. Address the root cause (e.g., wait for provider recovery, fix configuration issue)
3. Verify `/health` returns 200
4. Verify `/health/db` returns 200 with status "connected"
5. Verify `/ready` returns 200 with status "ready"
6. Run a non-destructive smoke test (basic health checks + one representative API call)
7. Monitor for recovery over a reasonable window (5-10 minutes)
8. Document the incident (see Section 24)

**Specific recovery by category:**

- **Database recovery:** Wait for Supabase to recover, then verify /health/db and /ready
- **Provider recovery:** Wait for the external provider to recover, then retry failed requests
- **AI provider recovery:** The orchestrator automatically retries with the fallback; manual intervention only needed if both providers fail
- **Rate-limit recovery:** Traffic will naturally decrease; no manual intervention needed
- **Circuit-breaker recovery:** After cooldown, circuit transitions to HALF_OPEN, then CLOSED on successful call

---

## 13. Rollback Procedure

### Application Rollback

1. Identify current release (version: "1.0.0" from /health response)
2. Identify last known-good release (previous deployed version)
3. Stop affected deployment if necessary (follow CI/CD deployment procedures)
4. Deploy previous application artifact (use CI/CD pipeline to redeploy prior version)
5. Verify `/health` returns 200 with expected status
6. Verify `/ready` returns 200 with status "ready"
7. Run smoke test (health checks + key API calls)
8. Confirm key APIs are functioning (destinations, AI chat, basic queries)
9. Monitor recovery and observe for regressions
10. If successful, continue with new release after review

**Do NOT perform schema rollback** unless a separately approved database migration exists.

### Database Rollback

- **Do NOT perform schema rollback** unless a separately approved database migration exists
- This project has intentionally avoided destructive schema migrations
- If data corruption is suspected, contact Supabase support
- Preserve existing data - do not run destructive queries
- Current project state: 36 tables, 38 RLS policies, zero schema changes permitted

---

## 14. Post-Incident Review

**Create an incident review using the template:**

| Field | Description |
|-------|-------------|
| incident_id | Unique identifier (e.g., incident-20240115-001) |
| start_time | ISO timestamp when incident was detected |
| end_time | ISO timestamp when incident was resolved |
| severity | P0, P1, P2, or P3 classification |
| affected_services | List of services impacted |
| symptoms | Observed symptoms (error codes, response times, etc.) |
| root_cause | Identified root cause |
| impact | Number of users affected, duration of impact |
| detection_method | How the incident was detected (alert, user report, health check) |
| mitigation | Steps taken to mitigate the incident |
| recovery | Steps taken to recover the service |
| follow_up_actions | Preventive actions to avoid recurrence |

**Do not store sensitive user information** in the incident review template.

---

## 15. Escalation Guidance

**When to escalate:**

- **P0 (Complete service outage / critical security event):** Escalate immediately to engineering leadership, on-call team, and Supabase support if database is affected
- **P1 (Major production degradation):** Escalate to engineering team within 30 minutes; include affected services, symptoms, and triage steps completed
- **P2 (Limited functionality degradation):** Escalate to engineering team within 2 hours; include detailed triage information
- **P3 (Minor issue / non-urgent bug):** Log in issue tracker; address in normal development cycle

**Escalation contacts:** (to be filled by organization)
- On-call engineering: []
- Engineering leadership: []
- Supabase support: []

---

## 16. Monitoring Failure Safety

**Observability must never become a single point of application failure:**

- If the metric collector/logging transport fails, the tourism API request must continue safely where possible
- If the observability helper throws an exception, the main request flow is unaffected
- Error handling in the error handler does not depend on observability components
- Health checks (/health, /health/db, /ready) remain functional even if monitoring is degraded
- Graceful shutdown remains functional regardless of observability status

**Key safety guarantees:**

- Request ID generation and propagation works independently of metrics
- Error handling and response sanitization work independently of metrics
- Health and readiness checks are prioritized over metric collection
- Circuit breakers and rate limiters have independent state management

---

## 17. Version Information

**Operators can determine which release is running via:**

- `GET /health` response includes: `service: "sih-tourism-backend"`, `version: "1.0.0"`, `environment` (from env)
- Application logs include startup version information
- Git commit SHA may be included if the deployment model supports it

**Do not expose secrets** in any version/metadata information.

**Where appropriate, include safe version information in /health:**

```json
{
  "status": "healthy",
  "service": "sih-tourism-backend",
  "version": "1.0.0",
  "environment": "production"
}
```

This does not break existing health response compatibility - the version field was already part of the /health response design.

---

# End of Runbook