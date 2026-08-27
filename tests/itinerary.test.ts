import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { CandidateFilter } from "../src/services/ai/itinerary/candidate.filter";
import { ItinerarySequencer } from "../src/services/ai/itinerary/itinerary.sequencer";
import { ItineraryValidator } from "../src/services/ai/itinerary/itinerary.validator";
import { ItineraryService } from "../src/services/ai/itinerary/itinerary.service";
import { AIProvider } from "../src/services/ai/providers/ai.provider";
import { CandidatePlace } from "../src/types/ai";
import { CurrentWeatherDto } from "../src/types/external";
import { RoutingService } from "../src/services/external/routing/routing.service";

describe("Phase 6D: Grounded Tourism Recommendations & Real Itinerary Generation", () => {
  const app = createApp();

  const mockAttractions = [
    {
      id: "attr-1",
      name: "Borra Caves",
      destination_id: "dest-araku",
      category: "Nature & Cave",
      description: "Historic million-year-old limestone caves",
      latitude: 18.28,
      longitude: 83.04,
      entry_fee: 80,
      created_at: "2026-01-01"
    },
    {
      id: "attr-2",
      name: "Araku Tribal Museum",
      destination_id: "dest-araku",
      category: "Culture & Museum",
      description: "Showcases indigenous tribal lifestyle and handicrafts",
      latitude: 18.33,
      longitude: 82.87,
      entry_fee: 40,
      created_at: "2026-01-01"
    },
    {
      id: "attr-3",
      name: "Padmapuram Gardens",
      destination_id: "dest-araku",
      category: "Botanical Garden",
      description: "Historic botanical gardens with tree huts and toy train",
      latitude: 18.32,
      longitude: 82.88,
      entry_fee: 30,
      created_at: "2026-01-01"
    },
    {
      id: "attr-4",
      name: "Chaparai Water Cascades",
      destination_id: "dest-araku",
      category: "Waterfalls & Nature",
      description: "Scenic rock stream surrounded by lush green forests",
      latitude: 18.31,
      longitude: 82.78,
      entry_fee: 10,
      created_at: "2026-01-01"
    }
  ];

  const mockAccessibility = [
    {
      id: "acc-1",
      attraction_id: "attr-2",
      wheelchair_access: true,
      ramps: true,
      lifts: false,
      accessible_toilet: true,
      accessible_transport: true,
      medical_distance_km: 2,
      verification_status: "verified",
      source: "Tourism Dept",
      source_url: null,
      notes: "Paved pathways",
      last_verified: "2026-01-01"
    }
  ];

  const mockElderlySupport = [
    {
      id: "eld-1",
      attraction_id: "attr-3",
      benches: true,
      ramps: true,
      lifts: false,
      accessible_toilet: true,
      stairs: "Level walking with gentle ramps",
      verification_status: "verified",
      source: "Local Admin",
      source_url: null,
      last_verified: "2026-01-01"
    }
  ];

  const mockOpeningHours = [
    {
      id: "oh-1",
      attraction_id: "attr-1",
      day_of_week: "Monday",
      opening_time: "09:00",
      closing_time: "17:30",
      is_closed: false,
      closed_days: "National Holidays",
      seasonal_notes: null,
      last_verified: "2026-01-01"
    }
  ];

  describe("1. Candidate Filtering & Relational Prioritization", () => {
    const filter = new CandidateFilter();

    it("should bound raw data to enriched candidates with verified amenities", () => {
      const candidates = filter.filterAndNormalize(
        {
          attractions: mockAttractions,
          accessibility: mockAccessibility,
          elderlySupport: mockElderlySupport,
          openingHours: mockOpeningHours
        },
        { travellerGroup: "parents", days: 2 }
      );

      expect(candidates.length).toBe(4);
      expect(candidates[0].id).toBeDefined();

      // Verify Padmapuram Gardens has elderly support attached
      const garden = candidates.find((c) => c.id === "attr-3");
      expect(garden?.isElderlyFriendly).toBe(true);
      expect(garden?.elderlyNotes.some((n) => n.includes("benches"))).toBe(true);

      // Verify Tribal Museum has wheelchair support attached
      const museum = candidates.find((c) => c.id === "attr-2");
      expect(museum?.isWheelchairAccessible).toBe(true);
      expect(museum?.accessibilityNotes).toContain("Wheelchair accessible");

      // Verify Borra Caves opening hours attached
      const caves = candidates.find((c) => c.id === "attr-1");
      expect(caves?.openingHours).toContain("09:00 - 17:30");
      expect(caves?.entryFee?.amount).toBe(80);
    });

    it("should strictly prefer child attractions and omit destination fallback when child attractions exist", () => {
      const candidates = filter.filterAndNormalize(
        {
          destination: { id: "dest-araku", name: "Araku Valley" },
          attractions: mockAttractions
        },
        { travellerGroup: "parents", days: 2 }
      );

      // All returned candidates must be attractions, destination fallback must not be included
      expect(candidates.length).toBe(4);
      expect(candidates.every((c) => c.type === "attraction")).toBe(true);
      expect(candidates.some((c) => c.id === "dest-araku")).toBe(false);
    });

    it("should include destination fallback AT MOST ONCE only when child attractions and experiences are empty", () => {
      const candidates = filter.filterAndNormalize(
        {
          destination: { id: "dest-araku", name: "Araku Valley" },
          attractions: [],
          experiences: []
        },
        { travellerGroup: "parents", days: 2 }
      );

      expect(candidates.length).toBe(1);
      expect(candidates[0].id).toBe("dest-araku");
      expect(candidates[0].type).toBe("destination_fallback");
    });
  });

  describe("2. Logical Itinerary Sequencing & Non-Duplication Rules", () => {
    const mockRoutingService = {
      calculateRoute: vi.fn().mockResolvedValue({
        origin: { latitude: 18.28, longitude: 83.04 },
        destination: { latitude: 18.33, longitude: 82.87 },
        distanceKm: 32.5,
        durationMinutes: 48,
        legs: []
      })
    } as unknown as RoutingService;

    const sequencer = new ItinerarySequencer(mockRoutingService);

    it("should sequence 2-day itinerary with unique places across days and max 2 activities per day for parents", async () => {
      const filter = new CandidateFilter();
      const candidates = filter.filterAndNormalize(
        {
          attractions: mockAttractions,
          accessibility: mockAccessibility,
          elderlySupport: mockElderlySupport
        },
        { travellerGroup: "parents", days: 2 }
      );

      const days = await sequencer.sequenceItinerary(candidates, {
        travellerGroup: "parents",
        days: 2
      });

      expect(days.length).toBe(2);
      expect(days[0].items.length).toBeLessThanOrEqual(2);
      expect(days[1].items.length).toBeLessThanOrEqual(2);

      // Collect all scheduled placeIds across all days
      const allScheduledPlaceIds = days.flatMap((d) => d.items.map((i) => i.placeId));
      const uniquePlaceIds = new Set(allScheduledPlaceIds);

      // Verify zero duplicates across days
      expect(allScheduledPlaceIds.length).toBe(uniquePlaceIds.size);
    });

    it("should scale down activities gracefully without duplicating places when candidates are fewer than slots", async () => {
      const singleCandidate: CandidatePlace[] = [
        {
          id: "dest-araku",
          name: "Araku Valley",
          type: "destination_fallback",
          accessibilityNotes: [],
          elderlyNotes: []
        }
      ];

      const days = await sequencer.sequenceItinerary(singleCandidate, {
        travellerGroup: "parents",
        days: 2
      });

      expect(days.length).toBe(2);
      expect(days[0].items.length).toBe(1);
      expect(days[0].items[0].placeId).toBe("dest-araku");
      expect(days[1].items.length).toBe(0); // Day 2 has 0 items because no second candidate exists
    });

    it("should adapt itinerary with weather warnings when precipitation probability is high", async () => {
      const filter = new CandidateFilter();
      const candidates = filter.filterAndNormalize(
        { attractions: mockAttractions },
        { travellerGroup: "family", days: 2 }
      );

      const rainyWeather: CurrentWeatherDto = {
        temperatureC: 21,
        apparentTemperatureC: 22,
        humidityPercent: 95,
        precipitationMm: 12,
        precipitationProbabilityPercent: 85,
        windSpeedKmh: 18,
        weatherCode: 61,
        weatherDescription: "Rain",
        isDay: true,
        time: "2026-08-25T10:00"
      };

      const days = await sequencer.sequenceItinerary(
        candidates,
        { travellerGroup: "family", days: 2 },
        rainyWeather
      );

      expect(days[0].items[0].weatherConsideration).toContain("Rain expected");
    });
  });

  describe("3. Anti-Hallucination & Global Uniqueness Validator", () => {
    const validator = new ItineraryValidator();
    const candidatePlaces: CandidatePlace[] = [
      {
        id: "attr-1",
        name: "Borra Caves",
        type: "attraction",
        accessibilityNotes: [],
        elderlyNotes: []
      },
      {
        id: "attr-2",
        name: "Araku Tribal Museum",
        type: "attraction",
        accessibilityNotes: ["Wheelchair accessible"],
        elderlyNotes: ["Resting benches"]
      },
      {
        id: "dest-fallback",
        name: "Araku Valley",
        type: "destination_fallback",
        accessibilityNotes: [],
        elderlyNotes: []
      }
    ];

    it("should reject fabricated place IDs generated by LLM", () => {
      const fakeAiOutput = {
        summary: "Trip to Araku",
        days: [
          {
            day: 1,
            items: [
              {
                placeId: "fake-id-12345",
                placeName: "Invented Alien Cave",
                reason: "Fake attraction"
              },
              {
                placeId: "attr-1",
                placeName: "Borra Caves",
                reason: "Real caves"
              }
            ]
          }
        ]
      };

      const sanitized = validator.validateAndSanitize(fakeAiOutput, candidatePlaces, 1);
      expect(sanitized.days?.length).toBe(1);
      expect(sanitized.days![0].items.length).toBe(1);
      expect(sanitized.days![0].items[0].placeId).toBe("attr-1");
    });

    it("should reject duplicate place IDs across MULTIPLE days", () => {
      const crossDayDuplicateAiOutput = {
        summary: "Trip plan with cross day duplicates",
        days: [
          {
            day: 1,
            items: [{ placeId: "attr-1", placeName: "Borra Caves" }]
          },
          {
            day: 2,
            items: [{ placeId: "attr-1", placeName: "Borra Caves" }]
          }
        ]
      };

      const sanitized = validator.validateAndSanitize(
        crossDayDuplicateAiOutput,
        candidatePlaces,
        2
      );
      expect(sanitized.days![0].items.length).toBe(1);
      expect(sanitized.days![1].items.length).toBe(0); // Duplicate on Day 2 discarded
    });

    it("should reject duplicate destination fallbacks across the entire itinerary", () => {
      const duplicateFallbackOutput = {
        summary: "Trip with repeated destination fallback",
        days: [
          {
            day: 1,
            items: [
              { placeId: "dest-fallback", placeName: "Araku Valley" },
              { placeId: "dest-fallback", placeName: "Araku Valley" }
            ]
          },
          {
            day: 2,
            items: [{ placeId: "dest-fallback", placeName: "Araku Valley" }]
          }
        ]
      };

      const sanitized = validator.validateAndSanitize(duplicateFallbackOutput, candidatePlaces, 2);
      expect(sanitized.days![0].items.length).toBe(1);
      expect(sanitized.days![1].items.length).toBe(0);
    });
  });

  describe("4. End-to-End Itinerary Service & Grounded Fallback", () => {
    it("should fallback cleanly without duplicates when AI provider is offline", async () => {
      const failingAiProvider: AIProvider = {
        providerName: "FailingAI",
        generateStructuredResponse: vi.fn().mockRejectedValue(new Error("Gemini API 503 Timeout")),
        generateText: vi.fn().mockRejectedValue(new Error("Timeout"))
      };

      const mockRoutingService = {
        calculateRoute: vi.fn().mockResolvedValue({
          origin: { latitude: 18.28, longitude: 83.04 },
          destination: { latitude: 18.33, longitude: 82.87 },
          distanceKm: 32.5,
          durationMinutes: 48,
          legs: []
        })
      } as unknown as RoutingService;

      const service = new ItineraryService(
        failingAiProvider,
        undefined,
        new ItinerarySequencer(mockRoutingService)
      );

      const res = await service.generateItinerary(
        "Plan a 2-day trip to Araku for my parents",
        { destinationName: "Araku", days: 2, travellerGroup: "parents" },
        {
          destination: { id: "dest-araku", name: "Araku Valley", state: "Andhra Pradesh" },
          attractions: mockAttractions,
          elderly_support: mockElderlySupport,
          sources: [{ type: "database", provider: "Supabase", resource: "destinations" }]
        }
      );

      expect(res.intent).toBe("trip_planning");
      expect(res.trip?.destination).toBe("Araku Valley");
      expect(res.trip?.durationDays).toBe(2);

      // Verify all placeIds in res.days are unique
      const scheduledIds = res.days!.flatMap((d) => d.items.map((i) => i.placeId));
      expect(scheduledIds.length).toBe(new Set(scheduledIds).size);
    });
  });

  describe("5. End-to-End API Verification: POST /api/v1/ai/chat", () => {
    it("should return fully grounded 2-day trip for Araku with parents group, unique places, and verified sources", async () => {
      const response = await request(app)
        .post("/api/v1/ai/chat")
        .send({ message: "Plan a 2-day trip to Araku for my parents" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.intent).toBe("trip_planning");
      expect(response.body.data.trip).toBeDefined();
      expect(response.body.data.trip.durationDays).toBe(2);
      expect(response.body.data.trip.travellerGroup).toBe("parents");
      expect(Array.isArray(response.body.data.days)).toBe(true);

      // Verify zero duplicate placeIds across the entire returned itinerary
      const allPlaceIds = response.body.data.days.flatMap(
        (d: { items: Array<{ placeId: string }> }) => d.items.map((i) => i.placeId)
      );
      expect(allPlaceIds.length).toBe(new Set(allPlaceIds).size);
      expect(Array.isArray(response.body.data.sources)).toBe(true);
    }, 30000);
  });
});
