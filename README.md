# SIH Smart Tourism Backend

Clean, robust, and fully grounded backend API for the Smart India Hackathon (SIH) Smart Tourism platform.

---

## 1. System Architecture

- **Runtime**: Node.js (v20+) with TypeScript and Express
- **Database**: Supabase PostgreSQL (36 typed tables, 38 active RLS policies, 698 destination records)
- **Design Pattern**: Repository → Service → Controller architecture with strict input validation, centralized error handling, and structured logging (`pino`).
- **External Data Layer**:
  - Weather: Open-Meteo API (16-day forecast horizon)
  - Routing: OSRM Public Driving Routing Engine
  - Geocoding: Open-Meteo Geocoding API
  - Translation: Indic Adapter / MyMemory Translation API
- **AI Tourism Orchestrator**:
  - Abstraction: `AIProvider` interface supporting Gemini (`gemini-2.5-flash`) with Deterministic Grounded Fallback
   - Tool Registry: 25 controlled tools executed safely with parameter validation and user-isolation guards
  - Grounded Itinerary Pipeline: Candidate filtration, relational prioritization, weather-aware multi-day sequencing, and anti-hallucination validation with zero-duplication guarantees.
- **Crowd Intelligence Service (Phase 7A)**:
  - Architecture: `CrowdPredictor` interface with `BaselineCrowdPredictor`
  - Deterministic evaluation of data sufficiency (`sufficient`, `limited`, `insufficient`)
  - Integration with `destinations.rush_free_hours`, seasonal factors (`best_time_to_visit`), weekend traffic, and live weather impact
  - Transparent confidence reporting (`high`, `medium`, `low`, `unavailable`) without synthetic or fabricated ML claims
- **Women Safety Intelligence Service (Phase 7B)**:
  - Architecture: `WomenSafetyService` and `WomenSafetyAnalyzer`
  - Grounded assessment across 5 verified Supabase tables (`women_safety`, `safety_indicators`, `safety_alerts`, `safety_incidents`, `emergency_resources`)
  - Deterministic data quality classification (`sufficient`, `limited`, `insufficient`) with available/unavailable evidence tracking
  - Transparent qualitative risk assessment (`low`, `moderate`, `elevated`, `unknown`) strictly preventing fabricated scores or false universal safety guarantees
  - Temporal freshness categorization (`recent`, `historical`, `stale`)
   - AI Tool `women_safety_intelligence` integration and women-safety-aware trip planning
- **Unified Traveller Context & Constraint Engine (Phase 8A)**:
  - One normalized request-scoped `TravellerContext` with per-field provenance (`explicit_request` / `stored_preference` / `derived` / `unknown`)
  - Deterministic constraint engine separating hard constraints, soft preferences, and optimization objectives with fixed priority ordering and conflict resolution
  - Request-level preference overrides never mutate stored preferences; unknown data stays unknown; zero automatic persistence
- **Preference Persistence, Context Preview & Trip Context Loop (Phase 8B)**:
  - Explicit persistence of schema-supported preferences via the existing `PUT /api/v1/tourist/preferences` endpoint with deterministic validation (invalid data → 400, never coerced), including `preferredLanguage` persisted to `users_profile`
  - Protected context-preview transparency endpoint (`GET /api/v1/ai/context-preview`) exposing only the caller's own normalized context, constraints, objectives, and unknowns — no secrets, tokens, table names, or raw records
  - Real trip-context loading through the existing ownership-verifying `TripService` (`trips`, `itinerary_items`, bounded saved places) for trip-relevant authenticated requests
  - Deterministic state/district/destination location resolution preserving ambiguity and returning bounded verified candidate sets
- **Multi-Destination Itinerary Orchestration & State-Level Planning (Phase 8C)**:
  - Transforms Phase 8B candidate sets into grounded multi-destination plans via a deterministic `MultiDestinationSelector` + `MultiDestinationPlanner`
  - Confirmation-first flow: state queries return a bounded shortlist for explicit selection; transparent automatic shortlisting only where verified data supports it
  - Inter-city routing via the existing OSRM service with a hard per-request call limit (≤6) and honest `unavailable` legs
  - Per-destination Phase 7 intelligence (only relevant modules × only selected destinations), cross-destination budget aggregation preserving Phase 7D uncertainty
- **Real-Time Adaptive Itinerary (Phase 8D)**:
  - Deterministic `ItineraryChangeDetector` + `PartialReplanner` for weather, crowd, safety, routing, schedule, availability and user-constraint triggers
  - Change-minimization tiers: reschedule → same-destination replacement → disclosure (never blind full regeneration)
  - Assess/suggest modes never persist; confirmed changes flow exclusively through the existing ownership-checked `TripService`
  - Hard-constraint revalidation precedes every proposed replacement; unknown stays unknown
- **Cross-Gap Validation & Conflict Engine (Phase 8E)**:
  - Deterministic multi-layer validation engine (`CrossGapValidator`) evaluating itineraries, adaptive changes, and AI output against all 10 priority constraint tiers
  - Strict separation of validation vs ranking: ranking selects the best valid option, but can never rescue a hard validation failure
  - Stable machine-readable conflict codes and deterministic severity classification (`critical`, `high`, `medium`, `low`, `info`)
  - Resolution actions (`REJECT`, `MODIFY`, `WARN`, `ACCEPT`) with minimal-change rule preservation
  - AI orchestrator output sanitization: blocks hallucinated places, invalid destination legs, and safety/accessibility violations before user return
- **Full 13-Gap Integration & End-to-End Validation (Phase 8F)**:
  - Master end-to-end integration suite (`tests/fullIntegration.test.ts`) executing 26 comprehensive scenario journeys across all 13 tourism intelligence domains
  - Complete verification of intent classification, unified context, deterministic location resolution, constraint priorities, multi-city routing, real-time adaptation, and anti-hallucination sanitization
  - Robust governance: request-scoped overrides never mutate stored profiles; explicit preference persistence only on explicit intent; cross-user isolation and zero private context leakage
  - Full system regression suite verified: 597 / 597 tests passing across all 25 test suites with 0 regressions, 0 database migrations, and 0 RLS modifications.



---

## 2. Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_JWT_SECRET=<jwt-secret>
GEMINI_API_KEY=<optional-gemini-api-key>
LOG_LEVEL=info
```

---

## 3. API Reference

### 3.1 Health & Probes
* `GET /health`: Basic service liveness probe
* `GET /health/db`: Database connectivity probe

### 3.2 Authentication & Authorization (Phase 3)
* `POST /api/v1/auth/register`: Register new tourist/business user
* `POST /api/v1/auth/login`: Authenticate with Supabase Auth
* `GET /api/v1/auth/me`: Authenticated user profile and RBAC role

### 3.3 Core Tourism Read APIs (Phase 4A)
* `GET /api/v1/destinations`: Paginated catalog with state, search, and category filters
* `GET /api/v1/destinations/:id`: Destination profile by UUID
* `GET /api/v1/destinations/:id/attractions`: Attractions under destination
* `GET /api/v1/destinations/:id/experiences`: Cultural activities & experiences
* `GET /api/v1/destinations/:id/opening-hours`: Operating hours for attractions
* `GET /api/v1/destinations/:id/entry-fees`: Ticket pricing (Domestic, Foreign, Student)
* `GET /api/v1/destinations/:id/accessibility`: Wheelchair, ramps, and lift details
* `GET /api/v1/destinations/:id/elderly-support`: Senior citizen amenities & benches
* `GET /api/v1/destinations/:id/images`: Verified photography and attributions
* `GET /api/v1/destinations/:id/languages`: Official and guide languages
* `GET /api/v1/destinations/:id/safety`: Aggregated safety metrics, alerts, incidents & women helpline
* `GET /api/v1/destinations/:id/emergency-resources`: Police stations, hospitals, helplines
* `GET /api/v1/destinations/:id/businesses`: Registered local tourism vendors

### 3.4 Tourist Trips, Itinerary, Bookmarks & Preferences (Phase 4B)
* `POST/GET/PUT/DELETE /api/v1/trips`: Trips management
* `POST/GET/PUT/DELETE /api/v1/trips/:id/items`: Trip itinerary items
* `POST/GET/DELETE /api/v1/saved-places`: Saved places bookmarks
* `GET/PUT /api/v1/tourist/preferences`: Travel preferences & profile

### 3.5 External / Real-Time Services (Phase 5)
* `GET /api/v1/weather/destinations/:id`: Live destination weather (`?date=YYYY-MM-DD` optional, up to 16 days)
* `GET /api/v1/routes`: Driving route calculation (`originLat`, `originLng`, `destinationLat`, `destinationLng` or destination UUIDs)
* `GET /api/v1/geocoding/search`: Place name geocoding search (`?q=...`)
* `POST /api/v1/translation`: Multilingual text translation (`{ sourceLanguage, targetLanguage, text }`)

### 3.6 AI Tourism Orchestrator (Phase 6)
* `POST /api/v1/ai/chat`: Multi-tool grounded tourism chat & trip planning (`{ "message": "..." }`)

### 3.7 Crowd Intelligence & Visiting-Time Forecasting (Phase 7A)
* `GET /api/v1/crowd/destinations/:id`: Grounded crowd level assessment, optimal rush-free windows, busy periods, and data quality metrics (`?date=YYYY-MM-DD` optional).

#### Crowd Intelligence Architecture & Methodology
- **Data Quality Assessment**:
  - `sufficient`: $\ge 12$ destination-specific historical observations across multiple periods.
  - `limited`: 1–11 historical records or state-level aggregate counts.
  - `insufficient`: 0 historical sensor records; baseline derived honestly from metadata and temporal factors.
- **Visiting-Window Extraction**: Parses verified `rush_free_hours` metadata (e.g. `Rush: 09:00-14:00 Free: 14:00-17:00`) into structured `recommendedWindows` and `busyWindows`.
- **Baseline Forecasting Formula**:
  - Base Score: 40
  - Weekend adjustment: $+20$ (elevated leisure footfall)
  - Peak season adjustment (`best_time_to_visit`): $+15$ (peak) or $-10$ (shoulder/off-peak)
  - Weather impact: $-20$ for high precipitation ($>60\%$) or $-15$ for extreme heat ($>38^\circ\text{C}$)
  - Clamped to $0\dots 100$ and mapped to `low` (0–35), `moderate` (36–65), `high` (66–85), `very_high` (86–100), or `unknown`.
- **Future ML Requirements**: Time-series footfall datasets from IoT entry sensors, ticketing counter logs, mobile tower density data, and parking occupancy metrics.

### 3.8 Women Safety Intelligence (Phase 7B)
* `GET /api/v1/safety/women/destinations/:id`: Grounded women safety assessment, emergency support infrastructure, verified alerts, and data quality indicators (`?date=YYYY-MM-DD` optional).

#### Women Safety Architecture & Methodology
- **Data Quality Assessment**:
  - `sufficient`: Destination has verified localized women safety records (e.g. local women police station, support center, or destination-specific indicator score) and verified emergency resources.
  - `limited`: Official national women helplines (`1091 / 181`) and general emergency services (`112`, `100`, `108`) are verified, but localized station/indicator data is not indexed for this specific destination.
  - `insufficient`: No `women_safety` record or missing emergency directories.
- **Risk Classification Rules (Deterministic & Explainable)**:
  - *No Fabricated Numeric Scores*: If an official score exists in `safety_indicators`, it is exposed as `sourceBackedScore`; otherwise no score is fabricated.
  - `elevated`: Triggered by active high/critical safety alerts or verified serious incidents within 365 days.
  - `moderate`: Triggered by active advisories or historical incidents requiring standard travel caution.
  - `low`: Assigned only when data quality is `sufficient`, verified local emergency infrastructure exists, and zero active alerts are present.
  - `unknown`: Assigned when data quality is `limited` or `insufficient` (because *absence of incidents $\neq$ guaranteed safe*).
- **Freshness Classification**:
  - `recent`: Occurred within 365 days of target travel date.
  - `historical`: Older than 365 days.
  - `stale`: Expired or resolved incident/alert.
- **AI Integration**:
  - Intent `women_safety_query` automatically selects `women_safety_intelligence` tool and returns verified facts, transparent limitations, and non-absolutist guidance.
  - Trip planning for women/solo travellers integrates women safety intelligence without hallucinating unsupported "safe zones" or unsafe areas.
- **Universal Safety Disclaimer**: Safety intelligence is grounded strictly in official datasets, public emergency facilities, and active advisories. Absence of reported incidents does not guarantee universal safety.

### 3.9 Elderly & Accessibility Travel Intelligence (Phase 7C)
* `GET /api/v1/accessibility/destinations/:id`: Grounded destination-level accessibility intelligence, wheelchair support status, verified facilities, and limitations (`?date=YYYY-MM-DD` optional).
* `GET /api/v1/accessibility/destinations/:id/attractions`: Attraction-level accessibility records and verified infrastructure.
* `GET /api/v1/accessibility/destinations/:id/elderly`: Destination-level senior citizen travel suitability, resting benches, stair barrier metrics, and pacing guidance.

#### Accessibility & Senior Travel Architecture & Grounding Rules
- **Accessibility Status Model**:
  - `supported`: Explicit verified evidence of wheelchair access OR (ramps AND accessible restrooms/lifts).
  - `partially_supported`: Some accessibility features verified (e.g. accessible transit or lifts), but with explicit limits or missing full wheelchair access.
  - `not_supported`: Explicit verified evidence indicating `wheelchair_access: false` OR high step count ($\ge 50$ stairs without ramps/lifts) OR high walking difficulty without assistance.
  - `unknown`: No verified accessibility records or unpopulated metadata. *(Unknown $\neq$ not supported)*.
- **Elderly Suitability Model**:
  - `suitable`: Verified positive evidence (resting benches, ramps, lifts, senior ticket concessions, or level ground) without high stair barriers or high walking difficulty.
  - `conditionally_suitable`: Moderate physical requirements, split opening hours, or stairs with some resting options.
  - `not_recommended`: High stair barriers ($50+$ stairs without lifts/ramps) or high walking demands without resting facilities.
  - `unknown`: Unindexed elderly support records. *(No elderly data $\neq$ not suitable)*.
- **Strict Grounding & Anti-Hallucination**:
  - *No Fabricated Terrain*: Terrain gradient is never inferred from destination names or categories; `terrainAssessment` is returned strictly as `"unavailable"`.
  - *No Fabricated Walking Difficulty*: Walking difficulty and step count are reported only when explicitly recorded in database columns.
  - *Separation of Driving vs Walking*: Driving distance/duration from routing engine does not represent walking path difficulty.
  - *Weather Contextualization*: High precipitation or heat alerts inform travel preparations without claiming weather causes structural inaccessibility.
- **AI Tool & Intent Integration**:
  - Controlled tools `accessibility_intelligence` and `elderly_travel_intelligence` registered in `TOOL_REGISTRY`.
  - `accessibility_query` and `elderly_travel_query` intents route to verified intelligence services and extract wheelchair / senior entities.
  - Candidate filtering in itinerary planning prioritizes verified wheelchair accessible and senior-friendly attractions.

### 3.10 Budget & Cost Intelligence (Phase 7D)
* `GET /api/v1/budget/destinations/:id`: Grounded destination-level budget assessment, known entry fees, verified concessions, and cost categories (`?userBudget=5000&adults=2&seniors=1...`).
* `GET /api/v1/budget/destinations/:id/fees`: Attraction-level entry fee catalog with domestic, senior, child, student, and foreign visitor price breakdowns.
* `POST /api/v1/budget/calculate`: Grounded custom budget calculation across specified attractions.

#### Budget & Cost Intelligence Architecture & Grounding Rules
- **Cost Sources**:
  - `entry_fees`: Official verified domestic, foreign, student, child, and senior citizen rates.
  - `experiences`: Official verified price fields for activities.
  - `travel_preferences`: Authenticated user budget constraints (`budget_min`, `budget_max`).
- **Cost Categories & Known vs Unknown Handling**:
  - `attractionFees`: Verified entry fees and experience costs.
  - `accommodation`: Uncatalogued lodging/hotel rates $\to$ marked as `"unknown"`, explicitly excluded from `knownSubtotal`.
  - `food`: Uncatalogued dining and meal rates $\to$ marked as `"unknown"`, explicitly excluded from `knownSubtotal`.
  - `transport`: Transit and taxi rates are uncatalogued $\to$ marked as `"unknown"`. *(Driving distance is NEVER multiplied into an invented transport cost)*.
  - `otherKnownCosts`: Add-ons with verified database provenance.
- **Budget Status Classification Rules**:
  - `over_budget`: When verified `knownSubtotal > userBudget` (the verified entry fees alone already exceed the user's allocated budget).
  - `under_budget`: Evaluated only when all major cost categories are verified and `knownSubtotal < userBudget`.
  - `near_budget`: When all categories are known and `knownSubtotal` is between $90\%$ and $100\%$ of `userBudget`.
  - `unknown`: When `knownSubtotal \le userBudget` BUT crucial categories (accommodation, food, transport) are unknown. The system truthfully discloses that final trip expenditure cannot be determined.
- **Data Quality Assessment**:
  - `sufficient`: Verified entry fees exist for $100\%$ of catalogued child attractions in the destination.
  - `limited`: Some attractions have verified fees, while others are unindexed.
  - `insufficient`: Zero verified entry fee records exist for the destination.
- **Senior & Student Discounts**:
  - Verified senior concessions (`fee_senior`) and student concessions (`fee_student`) are compared against standard domestic fees to compute explicit verified savings (e.g. *Senior fee: ₹40 vs standard fee: ₹100 — verified saving: ₹60 per senior*).
- **AI Tool & Intent Integration**:
  - Controlled tool `budget_intelligence` registered in `TOOL_REGISTRY` (21 controlled tools total).
  - `budget_query` intent routes cost queries directly to budget intelligence and extracts budget amounts and demographic counts.
  - Trip planning candidate ranking prioritizes verified free attractions ($+25$ score) and lower-fee attractions ($+15$ score) when budget constraints are active.
- **Incomplete Cost Disclaimer**: Budget intelligence is computed strictly from verified entry fee records in the database. Final travel expenditure will be higher as accommodation, dining, and transit rates are not catalogued.

### 3.11 Cultural & Experience Intelligence (Phase 7E)
* `GET /api/v1/experiences/destinations/:id`: Grounded destination-level cultural & experience intelligence, ranked experiences, regional languages, and category breakdowns (`?interests=heritage,culture&avoidInterests=adventure&includeBusinesses=true...`).
* `GET /api/v1/experiences/categories`: Supported standardized experience categories and deterministic mapping ontology.
* `POST /api/v1/experiences/rank`: Transparent deterministic candidate ranking across custom places and user interests.

#### Cultural & Experience Intelligence Architecture & Grounding Rules
- **Verified Sources**:
  - `experiences`: Official government tourism development projects, cultural zones, eco-trails, and verified activities.
  - `attractions`: Verified heritage forts, ancient temples, botanical gardens, and scenic spots.
  - `local_businesses`: Official verified homestays, local artisan centers, and dining establishments.
  - `languages`: Official state languages, local vernaculars, and tourist guide languages.
- **Deterministic Category Ontology**:
  - Raw title tokens and database categories are mapped deterministically into standardized categories: `culture`, `heritage`, `spiritual`, `nature`, `adventure`, `wellness`, `food`, `shopping`, `relaxation`, `family`, `photography`, `leisure`.
- **Transparent Multi-Interest Matching & Avoid Suppression**:
  - Direct interest match: $+35$ score.
  - Related domain category: $+20$ score.
  - Avoid-interest suppression: $-60$ penalty score and transparent `matchReason` disclosure.
  - Accessibility & senior factors: $+15$ for verified wheelchair/senior friendly places.
  - Low/Free cost boost: $+10$ for budget-conscious travellers.
- **Anti-Hallucination & Grounding Guarantees**:
  - *No Fabricated Cultural Facts*: Specific rituals or historical claims outside verified records are never invented; unknown disclosures are explicitly listed in `unknowns`.
  - *No Fabricated Festivals*: Temporary events and festival dates are disclosed as uncatalogued.
  - *No Fabricated Businesses*: Only verified establishments present in the database are returned.
  - *No Fabricated Costs or Hours*: Prices are reported strictly from database columns; unpriced experiences are marked as `"unknown"`.
### 3.12 Multi-Modal & Content Intelligence (Phase 7F)
* `GET /api/v1/content/destinations/:id/images`: Verified gallery metadata, image license status, source provenance, and accessible alt text.
* `GET /api/v1/content/destinations/:id/summary`: Grounded multi-section destination summary synthesizing attractions, experiences, languages, accessibility, entry fees, and safety helplines.
* `GET /api/v1/content/destinations/:id/multilingual`: Dual-language verified destination and attraction content with original source text preservation (`?lang=te` / `?lang=hi`).

#### Multi-Modal & Content Intelligence Architecture & Grounding Rules
- **Verified Data Sources**:
  - `images`: Official photography metadata, source attributions, photographer names, licensing terms, and verification statuses.
  - `destinations`: Official government tourism destination profiles, descriptions, and coordinates.
  - `attractions`: Verified child sightseeing sites, natural landmarks, and architectural monuments.
  - `languages`: Regional official languages, local dialects, and tourist guide languages.
  - `experiences`, `accessibility`, `elderly_support`, `entry_fees`, `emergency_resources`.
- **Accessible Alt-Text Strategy**:
  - If verified source attribution/caption exists: preserved directly with `generatedFromMetadata: false`.
  - If source alt-text is absent: generated conservatively from verified entity metadata (e.g. `"View of Abbey Falls, natural / scenic in Madikeri"`) and explicitly flagged with `generatedFromMetadata: true`.
  - Anti-hallucination guarantee: The system never invents visual claims (weather, steep cliffs, crowd density, ramp conditions, colors).
- **Image Licensing & Provenance Integrity**:
  - Missing license data is reported strictly as `"unknown"` (never assumes public domain or Creative Commons).
  - Missing image files or URLs are reported as `url: null`.
  - Image coverage is evaluated deterministically: `sufficient` ($\ge 2$ images with verified license), `limited` ($\ge 1$ images with unverified license or null URL), `insufficient` (0 images).
- **Multilingual Content Grounding**:
  - Regional language support is cross-referenced against the `languages` table.
  - Dual-language payloads preserve both original and translated text for transparent auditability.
  - Safe fallback guarantees original text preservation upon translation provider outages.
### 3.13 Local Business & Local Economy Intelligence (Phase 7G)
* `GET /api/v1/businesses/destinations/:id`: Verified local homestays, hotels, dining, handicraft artisans, and tour services for a destination (`?category=homestay`, `?search=spice`, `?verified=true`, `?limit=20`).
* `GET /api/v1/businesses/:id`: Verified single business details with official contact info, address, and provenance metadata.

#### Local Business & Local Economy Intelligence Architecture & Grounding Rules
- **Verified Data Sources**:
  - `local_businesses`: Official state tourism department approved directory records (Kerala Tourism verified homestay registry).
  - `destinations`: Official government tourism destination records.
- **Deterministic Category Ontology**:
  - Normalizes database `type` and names into standardized categories: `homestay`, `hotel`, `restaurant`, `handicraft`, `artisan`, `tour_operator`, `guide`, `transport`, `shopping`, `local_service`.
- **Data Quality Assessment**:
  - `sufficient`: $\ge 2$ verified businesses with contact details.
  - `limited`: 1 verified business or incomplete contact details.
  - `insufficient`: 0 verified businesses indexed (*"No verified local businesses are currently indexed for this destination."*).
- **Deterministic Ranking Weights**:
  - Exact category match: $+35$
  - Related category match: $+20$
  - Verified business boost: $+10$
  - Direct destination locality match: $+10$
  - User interest match: $+20$
  - Budget-constrained match: $+10$
  - Avoid-interest penalty: $-60$
- **Strict Grounding & Anti-Hallucination Guarantees**:
  - *No Fabricated Businesses*: Never invents business names, restaurants, or tour operators.
  - *No Fabricated Pricing*: Commercial pricing and menus are reported strictly as `"unknown"` (never assumes cheap/expensive from category).
  - *No Fabricated Hours*: Daily operating hours are reported as `"unknown"`.
  - *No Fabricated Ratings*: Reviews and 5-star ratings are reported as `"unknown"`.
  - *No Fabricated Accessibility / Safe Zones*: Physical wheelchair access and safety ratings for commercial venues are uncatalogued and reported as `"unknown"`.
- **AI Tool & Intent Integration**:
   - Single controlled tool `local_business_intelligence` registered in `TOOL_REGISTRY` (**25 controlled tools total**).
   - `local_business_query` intent routes business discovery questions and extracts `businessCategory` and `businessSearchTerm`.

### 3.14 Sustainability, Eco-Tourism & Carbon Intelligence (Phase 7H)
* `GET /api/v1/sustainability/destinations/:id`: Grounded destination-level sustainability assessment, verified eco/community attributes, low-impact travel options, and transport context (public endpoint; optional auth for future preference enrichment).

#### Sustainability Intelligence Architecture & Grounding Rules
- **Verified Data Sources**:
  - `experiences`: Eco-oriented and community-oriented experiences detected deterministically from verified names/categories.
  - `attractions`: Nature attractions (wildlife / natural / lake categories).
  - `local_businesses`: Verified homestays surfaced as community accommodation options.
  - `destinations`: Railway connectivity metadata (`nearest_railway`, distances) and rush-free hours reused from Phase 7A.
- **Sustainability Status Classification (Deterministic & Explainable)**:
  - `favorable`: $\ge 1$ verified eco/community experience AND $\ge 1$ nature attraction ($\ge 2$ independent signals).
  - `mixed`: Exactly 1 verified sustainability signal found.
  - `unknown`: Zero direct sustainability evidence. *(Absence of indexed eco records $\neq$ the destination is unsustainable)*.
  - `"unfavorable"` is intentionally excluded from the status model — the database contains zero verified evidence of environmental degradation, and assigning it would be fabrication.
- **Data Quality Assessment**:
  - `sufficient`: $\ge 1$ verified eco/community experience or nature attraction with transport context available.
  - `limited`: Only indirect signals (community accommodation or railway connectivity) without direct eco evidence.
  - `insufficient`: Zero sustainability-relevant records indexed.
- **Carbon Assessment — Always Unavailable**: No emission factors, verified transport-mode data, or fuel consumption records exist in the database. Any distance × factor calculation would be fabrication, so `carbonAssessment.status` is always `"unavailable"` and carbon footprint questions are answered with transparent disclosure instead of invented numbers.
- **Verified Attribute Disclaimers**: Every verified attribute explicitly states it is **NOT an eco-certification** — it is a database signal indicating community/nature orientation only.
- **Low-Impact Travel Options**: Surfaced as "lower travel burden" (railway travel, walking, community stays, local experiences, off-peak timing) — never claimed as "lower carbon emissions".
- **Unknown Disclosures**: Eco-certifications, green labels, recycling infrastructure, and conservation programs are reported in `unknowns` as uncatalogued.
- **AI Tool & Intent Integration**:
  - Controlled tool `sustainability_intelligence` registered in `TOOL_REGISTRY` (**25 controlled tools total**, tool #25).
  - `sustainability_query` intent routes eco/sustainable/green/community-tourism questions to grounded intelligence and extracts `ecoFriendlyPreference`, `communityPreference`, and `minimizeTravel` entities.
   - Intent precedence: sustainability keywords (`eco`, `sustainable`, `community tourism/travel`, `responsible tourism`, `green travel`) override generic planning verbs (`plan`, `trip to`) and generic `experience` matching, so queries like *"Plan an eco-friendly trip to Sikkim"* classify as `sustainability_query` and *"I prefer community tourism experiences"* carries `communityPreference`.
   - Trip planning integrates sustainability intelligence without fabricating green claims.

### 3.15 Unified Traveller Context & Constraint Engine (Phase 8A)

One normalized, request-scoped traveller context consumed consistently by the AI Orchestrator, itinerary planner, and specialized intelligence services.

```
USER REQUEST
     ↓
AUTHENTICATION / PUBLIC CONTEXT        (validated Supabase Auth — never client-supplied ids)
     ↓
TRAVELLER CONTEXT BUILDER              (TravellerContextService / ContextBuilder)
     ↓
NORMALIZED TRAVELLER CONTEXT           (facts + provenance + known/unknown tracking)
     ↓
CONSTRAINT ENGINE                      (hard constraints · soft preferences · objectives)
     ↓
AI ORCHESTRATOR + ITINERARY + SPECIALIZED INTELLIGENCE (Phase 7A–7H)
     ↓
FINAL RESPONSE (+ sanitized context summary)
```

#### Normalized TravellerContext Fields (adapted to the real schema)

| Field | Source table(s) | Type | Required | Control |
|-------|-----------------|------|----------|---------|
| `identity.authenticated/userId/role` | validated auth context (`user_roles`) | bool/string | yes | system-derived |
| `tripContext.destinationId/destinationName` | request entities → `destinations` | string | optional | user-controlled |
| `tripContext.travelDates.start/end` | request entities; `trips.start_date/end_date` | date | optional | user-controlled |
| `tripContext.durationDays` | request entities; fallback `travel_preferences.preferred_trip_days` | number | optional | both |
| `travellerProfile.travellerGroup` | request entities; derived from `tourist_profiles.solo_traveller/family_group/elderly_traveller` | enum | optional | both |
| `travellerProfile.ageContext/travelStyle` | `tourist_profiles.age_group/travel_style` | string | optional | user-controlled |
| `travellerProfile.interests` | request entities; `travel_preferences.interests` | string[] | optional | both |
| `travellerProfile.avoidInterests` | request entities only *(no stored equivalent exists)* | string[] | optional | user-controlled |
| `travellerProfile.accessibilityNeeds` | request entities; `travel_preferences.accessibility_needs` | string[] | optional | both |
| `travellerProfile.mobilityNeeds` | request entities; `tourist_profiles.mobility_needs` | string[] | optional | both |
| `travellerProfile.preferredLanguage` | `users_profile.preferred_language` | string | optional | user-controlled |
| `budget.amount/currency/priority` | request entities; `travel_preferences.budget_max` | number | optional | both |
| `preferences.avoidCrowds/preferEco/communityPreference/minimizeTravel` | request entities only | bool | optional | user-controlled |
| `safetyContext.womenSafetyRelevant/soloFemale` | request entities; `travel_preferences.safety_priority`; `tourist_profiles.safety_preferences/solo_traveller` | bool | derived default | both |
| `contentPreferences.targetLanguage` | request entities; fallback `users_profile.preferred_language` | string | optional | both |

Every field is a **SourcedValue** `{ value, source, confidence }` where `source ∈ {authenticated_identity, stored_profile, stored_preference, trip_context, explicit_request, derived, unknown}` and `confidence` uses semantic labels only (`verified | high | medium | low | unknown`). Resolved fields are tracked in `knownUserData`; missing fields land in `unknownUserData` and are **never coerced** to false/zero/safe/cheap/accessible.

#### Source Precedence (deterministic)

1. Authenticated verified database profile
2. Explicit current-request information *(overrides stored for THIS request only)*
3. Existing trip context
4. Existing stored preferences
5. Derived non-sensitive context
6. Unknown

Model-generated assumptions never override database facts. A request-level override ("answer in Hindi") applies to the current response only and **never mutates persistent preferences**.

#### Constraint Model & Priority Ordering

| Rank | Category | Default Strength |
|------|----------|------------------|
| 1 | Safety | hard |
| 2 | Explicit accessibility requirements (wheelchair etc.) | hard |
| 3 | Explicit prohibitions (avoid-interests) | hard |
| 4 | Travel-date / opening-hour feasibility | hard |
| 5 | Traveller physical constraints (reduced mobility, senior pacing) | soft |
| 6 | Budget — hard limit ONLY when explicitly stated; unknown cost categories remain unknown (Phase 7D preserved) | hard/soft |
| 7 | User interests | soft |
| 8 | Crowd preference | soft |
| 9 | Sustainability preference | soft |
| 10 | Secondary optimization objectives (minimize travel, fee minimization, community businesses) | objective |

Eco-friendly or cheap optimizations can NEVER outrank safety, accessibility, or explicit user requirements.

#### Conflict Resolution (deterministic)

Lower rank wins. Example: *wheelchair required + avoid crowds* → an accessible-but-crowded candidate remains eligible; a quiet-but-inaccessible candidate does not. Accessibility-unknown candidates are kept ONLY when zero verified-compliant options exist, with an explicit "UNKNOWN status — no accessibility guarantee" warning.

#### Persistence & Security Rules

- TravellerContext is a **request-time derived object** — nothing is written to Supabase automatically.
- Preferences persist only through existing explicit endpoints (`GET/PUT /api/v1/tourist/preferences`).
- User identity comes exclusively from validated auth context; cross-user isolation enforced; RLS untouched.
- The LLM receives only a sanitized summary (`SafeTravellerContextSummary`) — no emails, tokens, phones, internal ids, or unrelated private data.
- Stored preferences are loaded lazily, only for personalization-relevant intents (trip planning, itinerary help, budget/experience/business/content queries).

### 3.16 Preference Persistence, Context Preview & Trip Context Loop (Phase 8B)

#### Preference Persistence Model

| Field | Persisted to | Notes |
|-------|--------------|-------|
| `interests[]` | `travel_preferences.interests` | validated string array (≤20 items) |
| `accessibilityNeeds[]` | `travel_preferences.accessibility_needs` | validated string array |
| `budgetMin / budgetMax` | `travel_preferences.budget_min/max` | finite numbers ≥ 0; min ≤ max enforced |
| `preferredTripDays` | `travel_preferences.preferred_trip_days` | integer 1–365 |
| `safetyPriority` | `travel_preferences.safety_priority` | boolean or null |
| `travelStyle`, `ageGroup`, `budgetRange`, `mobilityNeeds[]`, `safetyPreferences[]`, solo/family/elderly flags | `tourist_profiles` | validated strings/arrays/booleans |
| **`preferredLanguage`** *(new in 8B)* | `users_profile.preferred_language` | supported language identifiers only |

- **Request-only fields**: `preferEco`, `avoidCrowds`, `communityPreference`, `minimizeTravel` have NO semantically correct existing storage column — they remain request-scoped by design (no schema change made).
- **Validation**: deterministic payload validation rejects invalid data with `400 BAD_REQUEST`; nothing is silently coerced.
- **CRITICAL RULE**: an AI conversation NEVER persists a detected preference. Only explicit user action persists:
  - calling `PUT /api/v1/tourist/preferences`, or
  - explicitly asking the assistant ("Remember that I prefer cultural experiences") — the only conversational path that writes.

#### Context Preview Endpoint

* `GET /api/v1/ai/context-preview`: protected transparency endpoint returning only the authenticated caller's own normalized context:

```jsonc
{
  "identity": { "authenticated": true, "role": "tourist" },
  "storedPreferences": { "language": "te", "interests": ["culture"], "accessibilityNeeds": [], "budget": { "min": null, "max": 10000 }, "preferredTripDays": null, "travelStyle": null },
  "travellerContext": { /* sanitized summary incl. active trip + constraints */ },
  "constraints": { "hard": ["..."], "soft": ["..."], "objectives": ["..."] },
  "unknowns": ["..."]
}
```

Never exposes: passwords, tokens, emails, phones, service secrets, raw database records, or internal table names. Never invokes the LLM.

#### Trip Context Loading

For authenticated requests referencing an existing trip (explicit trip UUID in the message, or clear phrasing like *"help me improve my existing trip"*), the context builder loads at most ONE trip via the existing ownership-verifying `TripService`:

- trip id/name, start/end dates, derived duration (`trips`)
- itinerary item count (`itinerary_items`)
- up to 5 saved place names as advisory context (`saved_places`) — recommendations stay advisory; saved itineraries are never rewritten automatically.

Cross-user access is impossible: ownership errors degrade gracefully and never load another user's data.

#### Location Resolution Architecture

Deterministic resolution runs whenever a destination entity was extracted:

```
User mentions location
   ↓ 1. Exact destination-name match        → destination (high confidence)
   ↓ 2. Multiple exact matches              → ambiguous
   ↓ 3. State match                         → state (+ bounded candidates)
   ↓ 4. District match                      → district (+ bounded candidates)
   ↓ 5. Multi partial-match                 → ambiguous
   ↓ nothing                                → unknown
```

Output: `{ locationType, query, resolvedState, resolvedDistrict, candidateDestinations[≤8], totalCandidates, confidence, warnings }`.

A state/district query **never silently becomes one random city**: for trip-planning intents, city-level tool resolution is suppressed, bounded verified candidates are disclosed in `locationResolution`, and an explicit warning states that no state-wide itinerary was fabricated. Ambiguity is preserved rather than auto-resolved by name similarity.

#### Security & Privacy Rules (8B additions)

- Identity exclusively from validated auth context; forged `userId` in request bodies is ignored.
- All preference reads/writes flow through existing repositories with RLS-preserving clients (no service-role bypass).
- Context preview and AI prompts exclude private data; internal source labels (`stored_preference`, etc.) are backend-only reasoning metadata.
- No preference/trip contents are logged.

#### Context Feedback Loop

Stored preferences are read fresh on every request (no caching): `PUT preferences → next AI request reflects the update immediately`. Request-level overrides apply to the current response only and expire with it.

### 3.17 Multi-Destination Itinerary Orchestration & State-Level Planning (Phase 8C)

```
USER REQUEST
   ↓
TravellerContext (8A) → LocationResolver (8B)
   ↓
state / district / multi-destination candidates  (bounded ≤ Phase 8B list)
   ↓
MultiDestinationSelector          ← explicit selectedDestinationIds OR deterministic auto-shortlist
   ↓   (awaiting_confirmation → shortlist returned; user selects)
MultiDestinationPlanner
   ├─ inter-city routing (OSRM, N−1 legs, ≤6 calls/request)
   ├─ deterministic day allocation
   ├─ per-destination days via existing CandidateFilter + ItinerarySequencer
   └─ per-destination Phase 7 intelligence (relevant modules ONLY)
   ↓
Grounded multi-destination plan (no LLM destination selection)
```

#### Selection Rules (deterministic — never ML claims)

**Hard constraints first**: explicit IDs must belong to the resolved candidate context (out-of-context IDs rejected with disclosure); wheelchair requirements demand verified accessibility evidence for automatic selection (unknown-status stays eligible ONLY with an explicit no-guarantee warning); a destination is auto-eligible only with ≥1 verified attraction or experience.

**Soft scoring** (absent data earns nothing, never penalized): `+min(attractions,10) +min(2×experiences,10) +20/interest match (cap 40) +10 eco/community evidence + safety note when relevant`.

**Automatic size rule**: ≤2-day trips → 1 destination; 3–5 days → default 2; >5 days → max 3. Never more destinations than the duration can realistically fit; zero-data candidates remain on the disclosed shortlist for explicit selection.

#### Confirmation Flow

`POST /api/v1/ai/chat` now accepts an optional `selectedDestinationIds: string[]`. State/district queries respond `mode=awaiting_confirmation` with the full bounded shortlist and ask the user to choose. Free-text requests naming ≥2 exact verified destinations ("Fort Kochi and Marari Beach") count as explicit selection (`mode=confirmed`, scope `multi_destination`). The LLM NEVER selects destination IDs from free text — selection happens in deterministic backend code.

#### Inter-City Routing & Sequencing

Only consecutive sequence legs are routed (N−1, hard limit **6 calls/request**, configurable). Missing coordinates or provider failures → leg status `unavailable` with distance/duration `null` — never estimated. Sequencing is deterministic nearest-neighbour over evaluated destinations and is described honestly as *"lowest-travel-burden sequence among the evaluated destinations"* — never claimed globally optimal.

#### Day Allocation

Every selected destination receives ≥1 day; remaining days distribute proportionally to verified attraction+experience counts. Verified legs >4h add a transparent "travel-dominated day" warning. If sensible allocation is impossible, a transparent limitation is returned instead of a forced plan.

#### Per-Destination Intelligence & Anti-Hallucination

Phase 7 modules run per SELECTED destination only, gated by context (crowd ⇐ avoid-crowds, women-safety ⇐ solo-female/safety-relevant, accessibility/elderly ⇐ requirement or senior group, budget ⇐ amount present, sustainability ⇐ eco/community/minimize). Safety assessments are never transferred between destinations; carbon stays `unavailable`; cross-destination budget aggregates known subtotals while accommodation/food/transport remain UNKNOWN. Global validation removes duplicate place IDs across destinations; every item references verified records only.

### 3.18 Real-Time Adaptive Itinerary (Phase 8D)

```
EXISTING ITINERARY (request-scoped snapshot, or owned saved trip via TripService)
      ↓
CURRENT CONDITIONS  (WeatherService · CrowdService(7A) · WomenSafety(7B) · Routing — memoized per destination)
      ↓
ItineraryChangeDetector        (deterministic severity rules — documented in types/adaptive.ts)
      ↓
PartialReplanner               (Tier 1: reschedule → Tier 2: same-destination replacement)
      ↓                          hard-constraint recheck BEFORE soft ranking
ADAPTATION RESPONSE            (assess_only | suggest_adjustments — never auto-persisted)
      ↓ explicit user confirmation + ownership
TripService apply path         (existing update/add/delete item methods; RLS preserved)
```

#### Supported Triggers & Detection Rules

| Trigger | Source | Severity rule (deterministic) |
|---------|--------|-------------------------------|
| Precipitation >60% / >5mm | WeatherService | high |
| Precipitation 40–60% | WeatherService | medium |
| Temperature >38°C / 35–38°C | WeatherService | high / medium |
| Crowd level very_high / high | Phase 7A baseline | high / medium (confidence carried, never hardened) |
| Scheduled block inside verified rush window | `destinations.rush_free_hours` | low (time-shift proposed) |
| Active safety alert / recent verified incident | Phase 7B | high |
| Route unavailable / duration increase >33% | OSRM via RoutingService | medium |
| Opening-hours conflict (verified hours only) | attraction records | low |
| Newly stated wheelchair requirement | user request | **high (hard constraint)** |
| Explicit budget change | user request | medium |
| Interest/preference adjustments | user request | low |

Weather exposure is never assumed: only outdoor-hinted categories/names are flagged as outdoor; unclassified items receive an honest "exposure unknown" disclosure. Failed external services produce NO triggers — the service is reported unavailable and the itinerary is preserved.

#### Change Minimization & Partial Replanning

Only affected items are re-evaluated; unaffected days/items are preserved verbatim. Deterministic tiers: **1** same place, valid different time block (verified free windows) → **2** same-destination verified replacement (hard constraints filtered first, interests/eco/fee soft-ranked second) → disclosure when no verified alternative exists (*"No verified alternative is currently available."*). Wording: *"Minimal-change adjustment based on evaluated verified alternatives"* — never a global-optimization claim.

#### Persistence Behavior

- AI conversation defaults to `suggest_adjustments`; nothing is written to Supabase.
- "Apply those changes" persists ONLY when an authenticated owner's saved trip is identified (`tripId`), exclusively through existing `TripService.updateItineraryItem / addItineraryItem / deleteItineraryItem` with full ownership validation.
- Trigger overrides ("Avoid crowds now", "wheelchair now", budget change) modify the REQUEST-SCOPED context only — Phase 8B persistence rules unchanged.
- No adaptation history table; changes are returned in the response for transparency.

---

## 4. Running the Project & Verification

### 1. Run Automated Tests
```bash
npm test
```

### 2. Code Quality (Linting & Formatting)
```bash
npm run lint
npm run format
```

### 3. Build & Run Production Server
```bash
npm run build
npm start
```



