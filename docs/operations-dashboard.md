# SIH Smart Tourism Backend - Operational Dashboard Specification

## Overview

Vendor-neutral dashboard panels for operational observability of the SIH Smart Tourism Platform backend. Each panel defines the metric, its meaning, warning signal, and critical signal.

---

## 1. Request Rate

- **Metric:** Total number of HTTP requests per time window (e.g., per minute)
- **Meaning:** Overall traffic volume through the API
- **Warning signal:** Sudden sustained increase > 20% above established baseline
- **Critical signal:** Sustained error rate accompanies the increase, or rate exceeds configured limits (causes 429 responses)

---

## 2. Error Rate

- **Metric:** Total number of error responses (4xx + 5xx) per time window
- **Meaning:** Overall error frequency of the API
- **Warning signal:** Error rate > 2% of total requests sustained over 5-minute window
- **Critical signal:** Error rate > 5% of total requests sustained over 5-minute window

---

## 3. 5xx Rate

- **Metric:** Count of 5xx (server error) responses per time window, as percentage of total requests
- **Meaning:** Server-side failure rate
- **Warning signal:** 5xx rate > 1% sustained over 5-minute window
- **Critical signal:** 5xx rate > 3% sustained over 5-minute window, or sustained increase indicating worsening failure

---

## 4. p95 Latency

- **Metric:** 95th percentile of request latency (durationMs) over a rolling window
- **Meaning:** Latency experienced by the majority of requests (worst-case normal)
- **Warning signal:** p95 significantly exceeds established baseline (from Phase 9E measurements)
- **Critical signal:** p95 exceeds critical threshold (e.g., >2x baseline) and is sustained

---

## 5. p99 Latency

- **Metric:** 99th percentile of request latency (durationMs) over a rolling window
- **Meaning:** Latency experienced by the tail of requests (outliers)
- **Warning signal:** p99 begins to trend upward toward critical threshold
- **Critical signal:** p99 exceeds critical threshold or shows sustained degradation

---

## 6. AI Request Latency

- **Metric:** Latency of AI orchestration requests (from orchestrator service) measured in durationMs
- **Meaning:** Time taken to generate AI-grounded tourism responses
- **Warning signal:** p95 AI latency exceeds established baseline
- **Critical signal:** AI latency degradation is sustained and severe, or AI fallback rate increases significantly

---

## 7. Tool Execution Count

- **Metric:** Number of tool executions per request (count of tools run by toolExecutor)
- **Meaning:** Operational intensity of AI orchestration per request
- **Warning signal:** Unusually high tool count (> MAX_TOOL_CALLS = 6) per request
- **Critical signal:** Repeatedly high tool counts indicating inefficient intent classification or entity resolution

---

## 8. Database Health

- **Metric:** Status of `/health/db` check (healthy/disconnected) and database latencyMs
- **Meaning:** Supabase database connectivity and performance
- **Warning signal:** LatencyMs exceeds established baseline (from Phase 9E measurements)
- **Critical signal:** `/health/db` returns 503 or "disconnected" status; sustained database unavailability

---

## 9. Provider Health

- **Metric:** Circuit breaker state for each external provider (OPEN/HALF_OPEN/CLOSED) and success/failure counts
- **Meaning:** Health of external services (Weather, Routing, Translation, Gemini AI)
- **Warning signal:** One provider repeatedly enters OPEN state; circuit breaker opens frequently
- **Critical signal:** Multiple external providers fail simultaneously; required core dependency remains OPEN

**Provider sub-panels:**

| Provider | Metric | Warning | Critical |
|---|---|---|---|
| Weather (Open-Meteo) | circuit state, success/failure count | one provider repeatedly opens | multiple providers fail simultaneously |
| Routing (OSRM) | circuit state, success/failure count | routing circuit opens repeatedly | routing + weather both fail |
| Translation (MyMemory) | circuit state, success/failure count | translation circuit opens repeatedly | |
| Gemini AI | circuit state, success/failure count, fallback count | AI provider repeatedly opens | AI fallback spike |

---

## 10. Rate Limits

- **Metric:** Count of 429 (rate-limit) responses per time window, aggregated by category
- **Meaning:** Rate-limit violation volume
- **Warning signal:** 429 volume suddenly exceeds normal baseline for a category
- **Critical signal:** 429 volume indicates widespread rate limiting; service availability impacted

---

## 11. Circuit Breaker States

- **Metric:** State of each provider circuit breaker (CLOSED/HALF_OPEN/OPEN) and consecutive failures count
- **Meaning:** Resilience state of external provider dependencies
- **Warning signal:** One provider repeatedly enters OPEN state
- **Critical signal:** Required core dependency remains OPEN across multiple cooldown cycles

---

## 12. Memory

- **Metric:** Process memory usage (heap total / heap used / rss) in MB
- **Meaning:** Memory consumption of the application process
- **Warning signal:** Memory usage trends upward toward critical threshold
- **Critical signal:** Memory usage exceeds available heap; risk of OOM kill

---

## 13. CPU

- **Metric:** Process CPU usage (% of total CPU) and load average
- **Meaning:** CPU consumption of the application process
- **Warning signal:** CPU usage trends upward sustainedly
- **Critical signal:** CPU usage spikes to critical levels; risk of request processing degradation

---

## 14. Readiness

- **Metric:** Status of `/ready` endpoint (ready/not_ready) and database check result
- **Meaning:** Application ability to serve required traffic
- **Warning signal:** /ready returns 503 intermittently
- **Critical signal:** /ready returns 503 continuously; service cannot accept traffic

---

## 15. Deployment Version

- **Metric:** Application version from /health response (e.g., "1.0.0") and environment
- **Meaning:** Which release is currently running
- **Warning signal:** Unexpected version after a deployment
- **Critical signal:** Wrong version running; rollback may be necessary

---

# Panel Definition Format

For each panel, the following fields are defined:

| Field | Description |
|-------|-------------|
| metric | The underlying Prometheus/vendor-neutral metric name |
| meaning | What the metric represents from an operational perspective |
| warning_signal | Condition that triggers a WARNING alert |
| critical_signal | Condition that triggers a CRITICAL alert |

**Note:** This specification uses vendor-neutral metric descriptions. Actual implementation may use any monitoring platform (Prometheus, Datadog, CloudWatch, etc.) or manual dashboards. The metric names and thresholds should be adapted to the chosen platform.

---

# End of Dashboard Specification