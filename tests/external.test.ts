import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { WeatherService } from "../src/services/external/weather/weather.service";
import { GeocodingService } from "../src/services/external/geocoding/geocoding.service";
import { RoutingService } from "../src/services/external/routing/routing.service";
import { TranslationService } from "../src/services/external/translation/translation.service";
import { WeatherProvider } from "../src/services/external/weather/weather.provider";
import { GeocodingProvider } from "../src/services/external/geocoding/geocoding.provider";
import { RoutingProvider } from "../src/services/external/routing/routing.provider";
import { TranslationProvider } from "../src/services/external/translation/translation.provider";
import { DestinationRepository } from "../src/repositories/destination.repository";
import { DestinationRow } from "../src/types/database.types";
import { BadGatewayError } from "../src/utils/appError";

describe("External / Real-Time API Layer Suite", () => {
  const app = createApp();

  describe("5A: Weather Service & Provider", () => {
    it("should return 400 for malformed destination UUID in weather request", async () => {
      const response = await request(app).get("/api/v1/weather/destinations/not-a-uuid");
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });

    it("should return 404 for non-existent destination in weather request", async () => {
      const nonExistent = "00000000-0000-0000-0000-000000000000";
      const response = await request(app).get(`/api/v1/weather/destinations/${nonExistent}`);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("should return 400 for invalid date format", async () => {
      const response = await request(app).get(
        "/api/v1/weather/destinations/00000000-0000-0000-0000-000000000000?date=25-08-2026"
      );
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("Expected YYYY-MM-DD format");
    });

    it("should return 400 for dates beyond the 16-day forecast horizon", async () => {
      const farFutureDate = "2099-01-01";
      const response = await request(app).get(
        `/api/v1/weather/destinations/00000000-0000-0000-0000-000000000000?date=${farFutureDate}`
      );
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("beyond the 16-day live forecast horizon");
    });

    it("should process weather data cleanly with mock provider", async () => {
      const mockDestRepo = new DestinationRepository();
      const mockWeatherProvider: WeatherProvider = {
        providerName: "MockWeather",
        fetchForecast: vi.fn().mockResolvedValue({
          latitude: 13.68,
          longitude: 79.35,
          timezone: "Asia/Kolkata",
          current: {
            temperatureC: 28.5,
            apparentTemperatureC: 31.0,
            humidityPercent: 65,
            precipitationMm: 0,
            windSpeedKmh: 12,
            weatherCode: 0,
            weatherDescription: "Clear sky",
            isDay: true,
            time: "2026-08-25T12:00"
          },
          dailyForecast: [],
          source: { provider: "MockWeather", retrievedAt: new Date().toISOString() }
        })
      };

      const destMock = {
        id: "02cdfbc0-98c3-46b0-a288-a619aa93ced2",
        name: "Tirupati Venkateswara Temple",
        latitude: 13.68,
        longitude: 79.35
      } as unknown as DestinationRow;

      vi.spyOn(mockDestRepo, "findById").mockResolvedValue(destMock);

      const customService = new WeatherService(mockWeatherProvider, mockDestRepo);
      const result = await customService.getDestinationWeather(destMock.id);

      expect(result.destinationName).toBe("Tirupati Venkateswara Temple");
      expect(result.current.temperatureC).toBe(28.5);
      expect(result.current.weatherDescription).toBe("Clear sky");
    });

    it("should reject destination with missing coordinates", async () => {
      const mockDestRepo = new DestinationRepository();
      const mockWeatherProvider: WeatherProvider = {
        providerName: "MockWeather",
        fetchForecast: vi.fn()
      };

      const noCoordsDest = {
        id: "02cdfbc0-98c3-46b0-a288-a619aa93ced2",
        name: "No Coords Place",
        latitude: null,
        longitude: null
      } as unknown as DestinationRow;

      vi.spyOn(mockDestRepo, "findById").mockResolvedValue(noCoordsDest);

      const customService = new WeatherService(mockWeatherProvider, mockDestRepo);
      await expect(customService.getDestinationWeather(noCoordsDest.id)).rejects.toThrow(
        "does not have geographic coordinates configured"
      );
    });
  });

  describe("5A: Geocoding Service & Provider", () => {
    it("should return 400 if query 'q' parameter is missing", async () => {
      const response = await request(app).get("/api/v1/geocoding/search");
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });

    it("should return 400 for query shorter than 2 characters", async () => {
      const response = await request(app).get("/api/v1/geocoding/search?q=a");
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("at least 2 characters long");
    });

    it("should return geocoded locations with mock provider", async () => {
      const mockGeocodeProvider: GeocodingProvider = {
        providerName: "MockGeocode",
        search: vi.fn().mockResolvedValue([
          {
            name: "Varanasi",
            latitude: 25.3176,
            longitude: 82.9739,
            country: "India",
            admin1: "Uttar Pradesh",
            formattedAddress: "Varanasi, Uttar Pradesh, India"
          }
        ])
      };

      const service = new GeocodingService(mockGeocodeProvider);
      const results = await service.search("Varanasi");

      expect(results.length).toBe(1);
      expect(results[0].name).toBe("Varanasi");
      expect(results[0].latitude).toBe(25.3176);
      expect(results[0].admin1).toBe("Uttar Pradesh");
    });
  });

  describe("5B: Routing Service & Provider", () => {
    it("should return 400 if coordinates are missing in GET /api/v1/routes", async () => {
      const response = await request(app).get("/api/v1/routes");
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });

    it("should return 400 for out-of-range coordinates", async () => {
      const response = await request(app).get(
        "/api/v1/routes?originLat=95.0&originLng=79.35&destinationLat=13.84&destinationLng=80.03"
      );
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("Must be between -90 and 90");
    });

    it("should return normalized route calculation from mock provider", async () => {
      const mockRoutingProvider: RoutingProvider = {
        providerName: "MockOSRM",
        calculateRoute: vi.fn().mockResolvedValue({
          origin: { latitude: 13.68, longitude: 79.35 },
          destination: { latitude: 13.84, longitude: 80.03 },
          distanceMeters: 85400,
          distanceKm: 85.4,
          durationSeconds: 5400,
          durationMinutes: 90,
          summary: "NH71 and NH16",
          geometry: null,
          provider: "MockOSRM",
          retrievedAt: new Date().toISOString()
        })
      };

      const mockDestRepo = new DestinationRepository();
      const service = new RoutingService(mockRoutingProvider, mockDestRepo);

      const route = await service.calculateRoute(13.68, 79.35, 13.84, 80.03);
      expect(route.distanceKm).toBe(85.4);
      expect(route.durationMinutes).toBe(90);
      expect(route.provider).toBe("MockOSRM");
    });

    it("should handle routing provider failure gracefully", async () => {
      const mockRoutingProvider: RoutingProvider = {
        providerName: "MockOSRM",
        calculateRoute: vi
          .fn()
          .mockRejectedValue(new BadGatewayError("OSRM routing failed: No route found"))
      };

      const mockDestRepo = new DestinationRepository();
      const service = new RoutingService(mockRoutingProvider, mockDestRepo);

      await expect(service.calculateRoute(13.68, 79.35, 13.84, 80.03)).rejects.toThrow(
        "OSRM routing failed"
      );
    });
  });

  describe("5C: Translation Service & Provider", () => {
    it("should return 400 for empty text in POST /api/v1/translation", async () => {
      const response = await request(app).post("/api/v1/translation").send({
        sourceLanguage: "en",
        targetLanguage: "hi",
        text: ""
      });
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("cannot be empty");
    });

    it("should return 400 if targetLanguage is missing", async () => {
      const response = await request(app).post("/api/v1/translation").send({
        sourceLanguage: "en",
        text: "Hello"
      });
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("targetLanguage is required");
    });

    it("should handle identity translation when source equals target", async () => {
      const mockTransProvider: TranslationProvider = {
        providerName: "MockTrans",
        translate: vi.fn()
      };

      const service = new TranslationService(mockTransProvider);
      const result = await service.translate("Namaste", "hi", "hindi");

      expect(result.translatedText).toBe("Namaste");
      expect(result.provider).toBe("Identity");
      expect(mockTransProvider.translate).not.toHaveBeenCalled();
    });

    it("should translate text using mock provider", async () => {
      const mockTransProvider: TranslationProvider = {
        providerName: "MockTrans",
        translate: vi.fn().mockResolvedValue({
          sourceLanguage: "en",
          targetLanguage: "hi",
          originalText: "Welcome to Incredible India",
          translatedText: "अतुल्य भारत में आपका स्वागत है",
          matchQuality: 0.95,
          provider: "MockTrans",
          retrievedAt: new Date().toISOString()
        })
      };

      const service = new TranslationService(mockTransProvider);
      const result = await service.translate("Welcome to Incredible India", "en", "hi");

      expect(result.translatedText).toBe("अतुल्य भारत में आपका स्वागत है");
      expect(result.sourceLanguage).toBe("en");
      expect(result.targetLanguage).toBe("hi");
    });

    it("should reject text exceeding 5000 characters", async () => {
      const mockTransProvider: TranslationProvider = {
        providerName: "MockTrans",
        translate: vi.fn()
      };

      const service = new TranslationService(mockTransProvider);
      const hugeText = "A".repeat(5001);

      await expect(service.translate(hugeText, "en", "hi")).rejects.toThrow(
        "exceeds maximum allowed length of 5000 characters"
      );
    });
  });
});
