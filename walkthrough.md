# SIH Smart Tourism Backend — Walkthrough

End-to-end walkthrough of the backend architecture, phase delivery, and verification runs.

---

## 1. Project Overview

A fully grounded Smart Tourism backend for the Smart India Hackathon platform:

- **Runtime**: Node.js (v20+) + TypeScript + Express
- **Database**: Supabase PostgreSQL (36 typed tables, RLS enforced)
- **Architecture**: Repository → Service → Controller with centralized error handling and structured `pino` logging
- **AI Layer**: `AIProvider` abstraction (Gemini `gemini-2.5-flash` with Deterministic Grounded Fallback), intent classification, safe tool execution over a controlled tool registry
- **Grounding Principle**: Every claim is traceable to verified database records or external API responses. Unknowns are disclosed explicitly — never fabricated.

## 2. Phase Delivery Timeline

| Phase | Scope | Key Deliverables |
|-------|-------|------------------|
| 3 | Auth & RBAC | Register/login (`Supabase Auth`), tourist/business roles, route guards |
| 4A/4B | Core tourism reads + user data | Destinations, attractions, fees, accessibility, images, languages; trips, itinerary items, saved places, preferences |
| 5 | External / real-time layer | Weather (Open-Meteo), routing (OSRM), geocoding, Indic translation |
| 6A–6C | AI orchestrator core | Intent classifier, grounded itinerary pipeline, tool registry & safe execution engine |
| 6D | Itinerary generation | Candidate filtration, weather-aware multi-day sequencing, anti-hallucination validation |
| 7A | Crowd intelligence | Rush-free window extraction, deterministic baseline forecasting, transparent confidence |
| 7B | Women safety intelligence | 5-table grounded assessment, qualitative risk levels (no fabricated scores), freshness tracking |
| 7C | Accessibility & elderly intelligence | Wheelchair/senior suitability models, strict no-fabricated-terrain rules |
| 7D | Budget & cost intelligence | Verified fee aggregation, honest unknown categories, senior/student concession savings |
| 7E | Cultural & experience intelligence | Category ontology, multi-interest ranking, avoid-interest suppression |
| 7F | Multi-modal & content intelligence | Image provenance/licensing integrity, accessible alt-text, multilingual content |
| 7G | Local business & economy intelligence | Verified vendor directory, deterministic category/ranking ontology |
| **7H** | **Sustainability, eco-tourism & carbon intelligence** | **See Section 3 below** |

## 3. Phase 7H — Sustainability, Eco-Tourism & Carbon Intelligence

### 3.1 Specification

Delivers destination-level sustainability intelligence strictly grounded in verified database signals:

1. **Verified attribute detection** (deterministic, name/category based):
   - `eco_experience` / `community_experience` from the `experiences` table
   - `nature_attraction` (wildlife / natural / lake categories) from `attractions`
   - `community_accommodation` (verified homestays) from `local_businesses`
   - `railway_access` / `walking_access` transport context from destination metadata
2. **Sustainability status model**: `favorable` ($\ge 2$ independent verified signals), `mixed` (exactly 1), `unknown` (zero evidence). `"unfavorable"` intentionally excluded — no verified degradation evidence exists in the database.
3. **Data quality model**: `sufficient`, `limited`, `insufficient` with evidence counts per attribute type.
4. **Carbon assessment**: Always `unavailable`. No emission factors or verified transport-mode data exist; distance × factor math would be fabrication.
5. **Low-impact options**: Railway travel, walking, community stays, local experiences, off-peak timing — framed as "lower travel burden", never "lower carbon emissions".
6. **Disclaimers on every attribute**: Signals indicate community/nature orientation only — **NOT eco-certifications**.
7. **AI integration**:
   - New controlled tool `sustainability_intelligence` (tool #25 in `TOOL_REGISTRY`)
   - New intent `sustainability_query` with entity extraction: `ecoFriendlyPreference`, `communityPreference`, `minimizeTravel`
   - Intent precedence rules: sustainability keywords override generic planning verbs (`plan`) and generic `experience` matching

### 3.2 Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/sustainability/destinations/:id` | Public (optional auth) | Full grounded sustainability assessment for a destination |

### 3.3 Response Shape (abridged)

```jsonc
{
  "destinationId": "uuid",
  "destinationName": "Yuksom",
  "state": "Sikkim",
  "sustainabilityStatus": "favorable",       // favorable | mixed | unknown
  "confidence": 0.8,                          // null unless >= 2 independent signals
  "dataQuality": {
    "status": "sufficient",                   // sufficient | limited | insufficient
    "evidenceCount": 4,
    "ecoExperienceCount": 2,
    "communityExperienceCount": 1,
    "natureAttractionCount": 1,
    "communityAccommodationCount": 0,
    "transportContextAvailable": true,
    "explanation": "..."
  },
  "verifiedAttributes": [ /* each carries a NOT-an-eco-certification disclaimer */ ],
  "communityOptions": [ /* eco/community experiences surfaced as orientation only */ ],
  "lowImpactOptions": [ /* railway_travel | walking | community_stay | local_experience | off_peak_timing */ ],
  "knownTransportContext": { "nearestRailway": "...", "railwayDistanceKm": 0 },
  "carbonAssessment": { "status": "unavailable", "explanation": "..." },
  "rushFreeHours": "Rush: 10:00-14:00 Free: 07:00-10:00",
  "recommendations": [ "..." ],
  "unknowns": [ "eco_certifications_and_green_labels", "..." ],
  "disclaimer": "...",
  "sources": [ /* full provenance chain */ ]
}
```

### 3.4 Intent Classifier Precedence Rules (Phase 7H refinement)

Two precedence conflicts were identified and resolved:

1. **Planning verb vs sustainability keyword**: *"Plan an eco-friendly trip to Sikkim"* previously classified as `trip_planning` because `plan` matched first.
   - Fix: The `trip_planning` branch now excludes queries containing sustainability keywords (`eco`, `sustainab*`, `community tourism/travel`, `responsible tourism`, `green travel`). These fall through to `sustainability_query` with `entities.ecoFriendlyPreference = true`.
2. **Generic `experience` vs `community tourism`**: *"I prefer community tourism experiences"* previously classified as `experience_query` because `experience` matched before `community tourism`.
   - Fix: The `experience_query` branch now excludes `community tourism` / `community travel` so these queries reach `sustainability_query` with `entities.communityPreference = true`.

### 3.5 Tool Registry Growth

| Milestone | Controlled Tools |
|-----------|------------------|
| Phase 6C baseline | 17 |
| Phase 7G (`local_business_intelligence`) | 24 |
| **Phase 7H (`sustainability_intelligence`)** | **25** |

## 4. Verification Runs

### 4.1 Automated Test Suite (`npm test`)

Final Phase 7H run:

```
Test Files  16 passed (16)
     Tests  377 passed (377)
  Duration  ~78 s
```

- **Result: 377/377 passing across all 16 suites — zero regressions.**
- Covers: health, auth/RBAC, destinations, trips/preferences, external APIs, AI orchestrator (classifier, tools, itinerary), crowd, women safety, accessibility, budget, experiences, content, business, planner, Supabase integration, and Phase 7H sustainability.

Key Phase 7H test coverage:
- `sustainability_intelligence` registered as tool #25 (registry total = 25 asserted in `tests/ai.test.ts` and `tests/business.test.ts`)
- Intent classification: eco-friendly trip → `sustainability_query`; sustainable travel, eco tourism, carbon footprint, community tourism all routed correctly
- Entity extraction: `ecoFriendlyPreference`, `communityPreference`
- Analyzer grounding: eco/community experience detection, nature attraction detection, non-certification disclaimers, status/data-quality classification (`favorable` / `mixed` / `unknown`), Araku Valley insufficient-evidence case
- HTTP endpoint: invalid UUID → 400, valid destination → 200 with grounded payload

### 4.2 Lint Check (`npm run lint`)

```
> eslint src/ tests/ --max-warnings=0
✔ 0 errors, 0 warnings
```

- Removed unused fixtures/imports from `tests/sustainability.test.ts` (`SustainabilityService`, `ATTR_ID_2`, `mockDestination`, `mockAccessibilityRecord`, `AccessibilityRow`) to satisfy the zero-warning gate.

### 4.3 Manual Smoke Checks

| Query | Expected Intent | Result |
|-------|-----------------|--------|
| "Plan an eco-friendly trip to Sikkim" | `sustainability_query` (+ `ecoFriendlyPreference`) | PASS |
| "What are sustainable travel options in Kerala?" | `sustainability_query` | PASS |
| "I prefer community tourism experiences" | `sustainability_query` (+ `communityPreference`) | PASS |
| "Plan a 2-day trip to Araku" | `trip_planning` (unchanged) | PASS |
| "Plan a 2-day quiet trip avoiding crowds" | `trip_planning` (unchanged) | PASS |
| Registry size | 25 tools | PASS |
