# Supabase-First AI Chatbot Architecture & Hardening Guide

## 1. Overview & Source-of-Truth Policy

The **SIH Smart Tourism Platform** operates on a strict **Supabase-First** architecture for all conversational AI and itinerary synthesis:

1. **Supabase is the Single Source of Truth**: All destination information, attractions, cultural experiences, accessibility records, elderly support amenities, verified entry fees, women safety emergency contacts, rush-free hours, and local business directories are queried directly from the verified database.
2. **LLM as Reasoning & Synthesis Layer**: The LLM (Google Gemini or deterministic fallback) functions exclusively as a reasoning, synthesis, and conversational formatting engine. It receives structured, verified JSON context and generates user-facing responses. The LLM is **NOT** a standalone knowledge repository.
3. **Strict Source Hierarchy**:
   - **Priority 1: Verified Supabase Database Records** (36 core relational tables).
   - **Priority 2: Approved Live External Providers** (Open-Meteo for real-time meteorological forecasts; OSRM for live driving duration/distance; Translation Adapter for Indic regional languages).
   - **Priority 3: Deterministic Grounded Fallback** (Code-governed synthesis when LLM provider is unavailable or fails grounding validation).
   - **Priority 4: LLM Conversational Synthesis** (Strictly bounded by verified facts).

---

## 2. Intent-to-Resource Mapping

The AI subsystem classifies user messages into 18 distinct tourism intents, dynamically loading **only the question-specific resources** required for that query:

| Intent | Primary Supabase Tables / Resources | Approved External Provider | Notes |
| :--- | :--- | :--- | :--- |
| `destination_information` | `destinations`, `attractions` | None | Overview, geography, climate basics |
| `destination_search` | `destinations` | None | State, district, and tag filtering |
| `trip_planning` | `destinations`, `attractions`, `experiences`, `safety_overview` | `Open-Meteo` (weather) | Multi-day itinerary synthesis |
| `itinerary_help` | `destinations`, `attractions`, `experiences` | None | Activity suggestions & pacing |
| `crowd_query` | `rush_free_hours`, `crowd_data` | `Open-Meteo` (for seasonal crowd impact) | Rush-free windows & baseline heuristics |
| `safety_query` | `safety_overview`, `emergency_resources`, `safety_alerts` | None | Verified helplines & advisory notices |
| `women_safety_query` | `safety_overview`, `emergency_resources`, `safety_incidents`, `safety_alerts` | None | 1091/112 helplines, risk levels, no absolute safety claims |
| `accessibility_query` | `destination_accessibility`, `elderly_support_amenities`, `attractions` | None | Wheelchair ramps, tactile paths, terrain |
| `elderly_travel_query` | `elderly_support_amenities`, `destination_accessibility` | None | Resting benches, stair counts, gentle pacing |
| `budget_query` | `entry_fees`, `attractions` | None | Verified entry fees, concession tracking; unknown lodging disclosed |
| `experience_query` | `experiences`, `attractions` | None | Cultural, tribal, culinary, and craft experiences |
| `local_business_query`| `local_businesses` | None | Verified homestays, hotels, craft shops; commercial rates disclosed |
| `sustainability_query`| `destination_sustainability`, `experiences` | None | Eco-ratings, community initiatives; no carbon guessing |
| `content_query` | `destination_content_summaries`, `destination_gallery`, `languages` | Translation Adapter (if requested) | Verified photo coverage & multilingual summaries |
| `weather_query` | `destinations` (coordinates) | `Open-Meteo` | Real-time temperature, humidity, UV index |
| `route_query` | `destinations` (origin & dest coordinates) | `OSRM` | Driving distance & transit duration |
| `translation_query` | `destination_content_summaries` | Translation Adapter | Dual-text source preservation |
| `general_tourism_query`| `destinations` | None | Conversational onboarding & guidance |

---

## 3. Question-Specific Data Loading

To maximize query efficiency, maintain privacy, and prevent context window exhaustion:
- Single-topic questions (e.g. "What is the weather in Araku?") load **only** the destination coordinates and execute `Open-Meteo`. Unrelated tables (`emergency_resources`, `entry_fees`, `elderly_support_amenities`) are **not** loaded.
- Public/unauthenticated requests **never** query `travel_preferences`, `user_trips`, or `user_saved_places`.
- Tool execution is capped at **6 tools per request** via `ToolExecutor`.

---

## 4. Zero Generic Web Search Policy

The system does **NOT** contain any generic web-search fallback (e.g., Google/Bing search APIs, serpapi, scraping bots):
- If information is not in Supabase or the approved live providers, the chatbot **honestly reports that data is uncatalogued or unavailable**.
- It does not fabricate external URLs, scrapings, or third-party blog opinions.

---

## 5. Unknown Data Policy & Anti-Hallucination

The system enforces strict truthfulness regarding unknown data:
1. **Unknown Prices**: If accommodation, restaurant, or transit pricing is not catalogued, it is reported as `unknown` / `commercial rates not tracked`. It is **never** defaulted to ₹0 or "free of cost".
2. **Unknown Safety**: If specific safety incidents are absent, the system states that no incidents are recorded, while clearly disclosing that *absence of recorded incidents does not guarantee absolute safety*. Absolute safety guarantees (e.g., "100% safe zone") are strictly forbidden and stripped by `CrossGapValidator`.
3. **Unknown Carbon Factors**: Exact numeric carbon footprint calculations are disclaimed as unavailable without certified vehicle emission factors, highlighting eco-friendly transit alternatives instead.
4. **Unknown Accessibility**: Attractions without verified ramp or lift records are marked as `unknown accessibility` with an advisory note to verify with venue operators.

---

## 6. Anti-Hallucination & Cross-Gap Validation Pipeline

Every response passes through a post-generation validation gate before being returned to the client:
```
User Message ──> Intent Classifier ──> Location Resolver ──> Traveller Context Builder
                                                                     │
                                                                     ▼
Client Response <── CrossGapValidator <── AI Provider (Gemini / Det.) <── Tool Executor
```

- **Candidate ID Grounding**: `CrossGapValidator` checks every suggested attraction, place, or business ID against the verified database records retrieved during tool execution. Any ungrounded place IDs are removed or corrected.
- **Deduplication**: Day items, recommendations, and provenance sources are deduplicated.
- **Constraint Enforcement**: Hard accessibility requirements (e.g., wheelchair ramp requirement) deterministically remove non-compliant attractions.

---

## 7. Security, Privacy & RBAC Isolation

- **Zero Auth Token / Secret Leakage**: AI prompts, safe context summaries, and log files never expose `Authorization` headers, JWTs, Supabase service role keys, user emails, or hashed passwords.
- **Caller Isolation**: Authenticated requests load strictly the authenticated caller's own stored preferences (`req.user.id`).
- **Cross-User Protection**: Trip ownership is strictly verified. Non-owners receive `403 Forbidden` / null context, preventing cross-user trip leaks.

---

## 8. Caching & Performance

- **RequestCache**: Bounded in-memory short-lived caching for geocoding coordinates, live weather responses, and routing calculations to avoid redundant external network roundtrips.
- **Rate Limiting**: Rate limit headers (`RateLimit-Limit`, `RateLimit-Remaining`) are enforced across all public and authenticated endpoints.
