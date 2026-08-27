import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { CrowdService } from "../src/services/crowd.service";
import { BaselineCrowdPredictor } from "../src/services/crowd/predictors/baseline.predictor";
import { CrowdRepository } from "../src/repositories/crowd.repository";
import { DestinationRepository } from "../src/repositories/destination.repository";
import { WeatherService } from "../src/services/external/weather/weather.service";
import { IntentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { TOOL_REGISTRY } from "../src/services/ai/tools/tool.registry";
import { ToolExecutor } from "../src/services/ai/tools/tool.executor";
import { ItinerarySequencer } from "../src/services/ai/itinerary/itinerary.sequencer";
import { Database } from "../src/types/database.types";
import { CurrentWeatherDto, NormalizedWeatherDto } from "../src/types/external";

type DestinationRow = Database["public"]["Tables"]["destinations"]["Row"];

describe("Phase 7A: Crowd Intelligence & Visiting-Time Forecasting Suite", () => {
  const app = createApp();

  const mockDestination: DestinationRow = {
    id: "01e98249-049a-4017-a5fb-98b913e05ca5",
    name: "Araku Valley",
    state: "Andhra Pradesh",
    city: "Araku",
    district: "Alluri Sitharama Raju",
    description: "Scenic hill station in the Eastern Ghats",
    category: "Hill Station",
    latitude: 18.3128,
    longitude: 82.8808,
    altitude: 914,
    best_time_to_visit: "Oct-Mar",
    rush_free_hours: "Rush: 09:00-14:00 Free: 14:00-17:00",
    tags: ["nature", "valleys"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };

  const mockWeatherDto: NormalizedWeatherDto = {
    destinationId: mockDestination.id,
    destinationName: mockDestination.name,
    latitude: 18.3128,
    longitude: 82.8808,
    elevationMeters: 914,
    timezone: "Asia/Kolkata",
    current: {
      temperatureC: 22,
      apparentTemperatureC: 23,
      humidityPercent: 80,
      precipitationMm: 0,
      precipitationProbabilityPercent: 20,
      windSpeedKmh: 10,
      weatherCode: 1,
      weatherDescription: "Mainly clear",
      isDay: true,
      time: "2026-08-25T10:00"
    },
    dailyForecast: [],
    source: { provider: "Open-Meteo", retrievedAt: "2026-08-25T10:00:00Z" }
  };

  describe("1. Data Sufficiency & Input Validation", () => {
    it("1. should reject invalid destination UUID with 400 Bad Request", async () => {
      const res = await request(app).get("/api/v1/crowd/destinations/not-a-uuid");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Invalid destination ID format");
    });

    it("2. should return 404 for non-existent destination UUID", async () => {
      const res = await request(app).get(
        "/api/v1/crowd/destinations/00000000-0000-0000-0000-000000000000"
      );
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("not found");
    });

    it("3. should reject invalid date parameter format with 400 Bad Request", async () => {
      const res = await request(app).get(
        `/api/v1/crowd/destinations/${mockDestination.id}?date=invalid-date`
      );
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Invalid date format");
    });

    it("4. should classify empty historical data as 'insufficient' status with honest reporting", async () => {
      const mockCrowdRepo = {
        getCrowdData: vi.fn().mockResolvedValue([]),
        getDemandData: vi.fn().mockResolvedValue([]),
        getVisitorCounts: vi.fn().mockResolvedValue([]),
        getDemandForecasts: vi.fn().mockResolvedValue([])
      } as unknown as CrowdRepository;

      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue({
          ...mockDestination,
          rush_free_hours: null,
          best_time_to_visit: null
        })
      } as unknown as DestinationRepository;

      const mockWeatherSvc = {
        getDestinationWeather: vi.fn().mockResolvedValue(mockWeatherDto)
      } as unknown as WeatherService;

      const svc = new CrowdService(
        mockCrowdRepo,
        mockDestRepo,
        mockWeatherSvc,
        new BaselineCrowdPredictor()
      );
      const res = await svc.getCrowdAssessment(mockDestination.id, "2026-08-25");

      expect(res.dataQuality.status).toBe("insufficient");
      expect(res.dataQuality.historicalObservations).toBe(0);
      expect(res.reasoning.some((r) => r.includes("No direct historical crowd observations"))).toBe(
        true
      );
    });

    it("5. should classify 1-11 observations as 'limited' data quality status", async () => {
      const predictor = new BaselineCrowdPredictor();
      const res = await predictor.assess({
        destination: mockDestination,
        targetDate: "2026-08-25",
        crowdObservations: [
          {
            id: "c-1",
            destination_id: mockDestination.id,
            observed_at: "2026-08-01",
            visitor_count: 500,
            crowd_score: 45,
            crowd_level: "moderate",
            confidence: 0.8,
            festival: false,
            holiday: false,
            weather_context: null,
            source: "Manual Audit",
            created_at: "2026-08-01"
          }
        ],
        demandData: [],
        visitorCounts: [],
        demandForecasts: []
      });

      expect(res.dataQuality.status).toBe("limited");
      expect(res.dataQuality.historicalObservations).toBe(1);
      expect(res.crowd.confidence).toBe("medium");
    });

    it("6. should classify 12+ destination observations as 'sufficient' data quality status", async () => {
      const predictor = new BaselineCrowdPredictor();
      const twelveObs = Array.from({ length: 12 }, (_, i) => ({
        id: `c-${i + 1}`,
        destination_id: mockDestination.id,
        observed_at: `2026-0${(i % 8) + 1}-01`,
        visitor_count: 800,
        crowd_score: 60,
        crowd_level: "moderate",
        confidence: 0.9,
        festival: false,
        holiday: false,
        weather_context: null,
        source: "Sensor Data",
        created_at: "2026-01-01"
      }));

      const res = await predictor.assess({
        destination: mockDestination,
        targetDate: "2026-08-25",
        crowdObservations: twelveObs,
        demandData: [],
        visitorCounts: [],
        demandForecasts: []
      });

      expect(res.dataQuality.status).toBe("sufficient");
      expect(res.dataQuality.historicalObservations).toBe(12);
      expect(res.crowd.confidence).toBe("high");
    });
  });

  describe("2. Deterministic Crowd Logic & Visiting Window Extraction", () => {
    const predictor = new BaselineCrowdPredictor();

    it("7. should extract verified rush and free windows from destination rush_free_hours with metadata provenance", async () => {
      const res = await predictor.assess({
        destination: mockDestination,
        targetDate: "2026-08-25",
        crowdObservations: [],
        demandData: [],
        visitorCounts: [],
        demandForecasts: []
      });

      expect(res.busyWindows.length).toBe(1);
      expect(res.busyWindows[0].startTime).toBe("09:00");
      expect(res.busyWindows[0].endTime).toBe("14:00");
      expect(res.busyWindows[0].description).toContain("metadata");

      expect(res.recommendedWindows.length).toBe(1);
      expect(res.recommendedWindows[0].startTime).toBe("14:00");
      expect(res.recommendedWindows[0].endTime).toBe("17:00");
      expect(res.recommendedWindows[0].description).toContain("metadata");
    });

    it("8. should fallback to domain baseline windows when rush_free_hours is missing", async () => {
      const res = await predictor.assess({
        destination: { ...mockDestination, rush_free_hours: null },
        targetDate: "2026-08-25",
        crowdObservations: [],
        demandData: [],
        visitorCounts: [],
        demandForecasts: []
      });

      expect(res.recommendedWindows[0].label).toContain("Early Morning");
      expect(res.busyWindows[0].label).toContain("Midday");
    });

    it("9. should increase crowd expectation for weekend dates (Saturday/Sunday) and note heuristic in reasoning", async () => {
      // 2026-08-29 is a Saturday, 2026-08-25 is a Tuesday
      const weekdayRes = await predictor.assess({
        destination: mockDestination,
        targetDate: "2026-08-25",
        crowdObservations: [],
        demandData: [],
        visitorCounts: [],
        demandForecasts: []
      });

      const weekendRes = await predictor.assess({
        destination: mockDestination,
        targetDate: "2026-08-29",
        crowdObservations: [],
        demandData: [],
        visitorCounts: [],
        demandForecasts: []
      });

      expect(weekendRes.crowd.baselineIndex!).toBeGreaterThan(weekdayRes.crowd.baselineIndex!);
      expect(weekendRes.reasoning.some((r) => r.includes("weekend-pattern heuristic"))).toBe(true);
      expect(weekdayRes.reasoning.some((r) => r.includes("weekday/weekly-pattern heuristic"))).toBe(
        true
      );
    });

    it("10. should recognize peak season months according to best_time_to_visit with seasonal heuristic", async () => {
      // Araku best_time_to_visit is Oct-Mar
      const peakMonthRes = await predictor.assess({
        destination: mockDestination,
        targetDate: "2026-11-15", // November
        crowdObservations: [],
        demandData: [],
        visitorCounts: [],
        demandForecasts: []
      });

      expect(peakMonthRes.reasoning.some((r) => r.includes("seasonal heuristic"))).toBe(true);
      expect(peakMonthRes.crowd.unit).toBe("baseline_crowd_index_0_100");
    });
  });

  describe("3. Weather Integration & Error Isolation", () => {
    it("11. should incorporate weather rain probability with weather heuristic disclosure", async () => {
      const predictor = new BaselineCrowdPredictor();
      const rainyWeather: CurrentWeatherDto = {
        temperatureC: 20,
        apparentTemperatureC: 21,
        humidityPercent: 95,
        precipitationMm: 12,
        precipitationProbabilityPercent: 85,
        windSpeedKmh: 15,
        weatherCode: 61,
        weatherDescription: "Rain",
        isDay: true,
        time: "2026-08-25T10:00"
      };

      const res = await predictor.assess({
        destination: mockDestination,
        targetDate: "2026-08-25",
        crowdObservations: [],
        demandData: [],
        visitorCounts: [],
        demandForecasts: [],
        weather: rainyWeather
      });

      expect(res.reasoning.some((r) => r.includes("Weather heuristic applied"))).toBe(true);
      expect(res.sources.some((s) => s.provider === "Open-Meteo")).toBe(true);
    });

    it("12. should isolate weather service errors so crowd assessment still succeeds", async () => {
      const mockCrowdRepo = {
        getCrowdData: vi.fn().mockResolvedValue([]),
        getDemandData: vi.fn().mockResolvedValue([]),
        getVisitorCounts: vi.fn().mockResolvedValue([]),
        getDemandForecasts: vi.fn().mockResolvedValue([])
      } as unknown as CrowdRepository;

      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const failingWeatherSvc = {
        getDestinationWeather: vi.fn().mockRejectedValue(new Error("Open-Meteo timeout"))
      } as unknown as WeatherService;

      const svc = new CrowdService(
        mockCrowdRepo,
        mockDestRepo,
        failingWeatherSvc,
        new BaselineCrowdPredictor()
      );
      const res = await svc.getCrowdAssessment(mockDestination.id, "2026-08-25");

      expect(res.destinationId).toBe(mockDestination.id);
      expect(res.crowd.level).toBeDefined();
    });
  });

  describe("4. AI Intent Classification & Tool Registry Integration", () => {
    const classifier = new IntentClassifier();

    it("13. should classify 'What is the best time to visit Araku without crowds?' as crowd_query", () => {
      const result = classifier.classify("What is the best time to visit Araku without crowds?");
      expect(result.intent).toBe("crowd_query");
      expect(result.entities.destinationName).toBe("Araku");
      expect(result.requiredTools).toContain("crowd_intelligence");
    });

    it("14. should extract avoidCrowds entity when user asks for quiet/peaceful trip", () => {
      const result = classifier.classify("Plan a 2-day quiet trip to Araku avoiding crowds");
      expect(result.intent).toBe("trip_planning");
      expect(result.entities.avoidCrowds).toBe(true);
      expect(result.requiredTools).toContain("crowd_intelligence");
    });

    it("15. should verify crowd_intelligence tool is publicly accessible in registry", () => {
      const toolMeta = TOOL_REGISTRY["crowd_intelligence"];
      expect(toolMeta).toBeDefined();
      expect(toolMeta.category).toBe("tourism");
      expect(toolMeta.requiresAuth).toBe(false);
    });

    it("16. should execute crowd_intelligence tool in ToolExecutor and attach crowd context", async () => {
      const mockCrowdSvc = {
        getCrowdAssessment: vi.fn().mockResolvedValue({
          destinationId: mockDestination.id,
          destinationName: mockDestination.name,
          date: "2026-08-25",
          crowd: {
            level: "moderate",
            baselineIndex: 45,
            unit: "baseline_crowd_index_0_100",
            confidence: "medium"
          },
          recommendedWindows: [
            { startTime: "14:00", endTime: "17:00", label: "Rush-Free", description: "Clear" }
          ],
          busyWindows: [],
          dataQuality: { status: "limited", historicalObservations: 1, sourceCount: 2 },
          reasoning: ["Grounded assessment"],
          sources: [{ type: "database", provider: "Supabase", resource: "destinations" }]
        })
      } as unknown as CrowdService;

      const executor = new ToolExecutor(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockCrowdSvc
      );

      const ctx = await executor.executeTools(["crowd_intelligence"], {
        destinationId: mockDestination.id,
        destinationName: "Araku Valley"
      });

      expect(ctx.crowd).toBeDefined();
      expect(ctx.crowd?.crowd.level).toBe("moderate");
      expect(mockCrowdSvc.getCrowdAssessment).toHaveBeenCalledWith(mockDestination.id, undefined);
    });
  });

  describe("5. Itinerary Integration & Crowd Pacing", () => {
    it("17. should annotate rush-free timing when avoidCrowds is requested", async () => {
      const sequencer = new ItinerarySequencer();
      const candidates = [
        {
          id: "attr-1",
          name: "Borra Caves",
          type: "attraction" as const,
          accessibilityNotes: [],
          elderlyNotes: []
        }
      ];

      const days = await sequencer.sequenceItinerary(candidates, {
        days: 1,
        avoidCrowds: true
      });

      expect(days[0].items[0].elderlyNotes.some((n) => n.includes("rush-free window"))).toBe(true);
    });
  });

  describe("6. Grounding & Anti-Fabrication Invariants", () => {
    it("18. should not fabricate synthetic crowd counts and disclose baselineIndex heuristic", async () => {
      const predictor = new BaselineCrowdPredictor();
      const res = await predictor.assess({
        destination: { ...mockDestination, rush_free_hours: null, best_time_to_visit: null },
        targetDate: "2026-08-25",
        crowdObservations: [],
        demandData: [],
        visitorCounts: [],
        demandForecasts: []
      });

      expect(res.dataQuality.historicalObservations).toBe(0);
      expect(res.dataQuality.status).toBe("insufficient");
      expect(res.crowd.level).toBe("unknown");
      expect(res.crowd.baselineIndex).toBeNull();
      expect(res.crowd.unit).toBeNull();
    });
  });

  describe("7. End-to-End API Verification", () => {
    it("19. should serve GET /api/v1/crowd/destinations/:id publicly without auth", async () => {
      const res = await request(app).get(`/api/v1/crowd/destinations/${mockDestination.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationId).toBe(mockDestination.id);
      expect(res.body.data.crowd).toBeDefined();
      expect(res.body.data.crowd.unit).toBe("baseline_crowd_index_0_100");
      expect(res.body.data.dataQuality).toBeDefined();
      expect(Array.isArray(res.body.data.recommendedWindows)).toBe(true);
      expect(Array.isArray(res.body.data.busyWindows)).toBe(true);
      expect(Array.isArray(res.body.data.sources)).toBe(true);
    });

    it("20. should serve GET /api/v1/crowd/destinations/:id?date=YYYY-MM-DD for a specific date", async () => {
      const res = await request(app).get(
        `/api/v1/crowd/destinations/${mockDestination.id}?date=2026-12-25`
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.date).toBe("2026-12-25");
    });

    it("21. should process AI chat crowd query with grounded crowd intelligence tool and heuristic disclosure", async () => {
      const res = await request(app)
        .post("/api/v1/ai/chat")
        .send({ message: "What is the best time to visit Araku without crowds?" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe("crowd_query");
      expect(res.body.data.summary).toContain("Baseline crowd assessment");
      expect(res.body.data.crowd).toBeDefined();
      expect(res.body.data.crowd.destinationName).toBe("Araku Valley");
      expect(res.body.data.crowd.crowd.unit).toBe("baseline_crowd_index_0_100");
      expect(Array.isArray(res.body.data.sources)).toBe(true);
    }, 35000);
  });
});
