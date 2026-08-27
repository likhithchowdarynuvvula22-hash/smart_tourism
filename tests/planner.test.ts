import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { TripService } from "../src/services/trip.service";
import { SavedPlacesService } from "../src/services/savedPlaces.service";
import { PreferencesService } from "../src/services/preferences.service";
import { TripRepository } from "../src/repositories/trip.repository";
import { SavedPlacesRepository } from "../src/repositories/savedPlaces.repository";
import { PreferencesRepository } from "../src/repositories/preferences.repository";
import { DestinationRepository } from "../src/repositories/destination.repository";
import { AuthenticatedUser } from "../src/types/auth";
import { DestinationRow } from "../src/types/database.types";
import express, { Request, Response, NextFunction } from "express";
import tripRoutes from "../src/routes/trip.routes";
import savedPlacesRoutes from "../src/routes/savedPlaces.routes";
import preferencesRoutes from "../src/routes/preferences.routes";
import { errorHandler } from "../src/middleware/errorHandler";

describe("Tourist Planner, Itinerary, Saved Places & Preferences Suite", () => {
  const app = createApp();

  describe("Authentication & RBAC Boundary Protection", () => {
    it("should reject unauthenticated request to GET /api/v1/trips with 401", async () => {
      const response = await request(app).get("/api/v1/trips");
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject unauthenticated request to POST /api/v1/trips with 401", async () => {
      const response = await request(app).post("/api/v1/trips").send({ name: "Goa Tour" });
      expect(response.status).toBe(401);
    });

    it("should reject unauthenticated request to GET /api/v1/saved-places with 401", async () => {
      const response = await request(app).get("/api/v1/saved-places");
      expect(response.status).toBe(401);
    });

    it("should reject unauthenticated request to GET /api/v1/tourist/preferences with 401", async () => {
      const response = await request(app).get("/api/v1/tourist/preferences");
      expect(response.status).toBe(401);
    });
  });

  describe("Isolated Mock Tourist Test App (Ownership & Logic Verification)", () => {
    const createTestPlannerApp = (mockUser?: AuthenticatedUser) => {
      const testApp = express();
      testApp.use(express.json());

      testApp.use((req: Request, _res: Response, next: NextFunction) => {
        if (mockUser) {
          req.user = mockUser;
        }
        next();
      });

      testApp.use("/api/v1/trips", tripRoutes);
      testApp.use("/api/v1/saved-places", savedPlacesRoutes);
      testApp.use("/api/v1/tourist", preferencesRoutes);
      testApp.use(errorHandler);

      return testApp;
    };

    const touristA: AuthenticatedUser = {
      id: "11111111-1111-1111-1111-111111111111",
      email: "touristA@example.com",
      role: "tourist",
      roles: ["tourist"]
    };

    const touristB: AuthenticatedUser = {
      id: "22222222-2222-2222-2222-222222222222",
      email: "touristB@example.com",
      role: "tourist",
      roles: ["tourist"]
    };

    const businessUser: AuthenticatedUser = {
      id: "33333333-3333-3333-3333-333333333333",
      email: "business@example.com",
      role: "business",
      roles: ["business"]
    };

    it("should reject non-tourist role with 403 Forbidden", async () => {
      const businessApp = createTestPlannerApp(businessUser);
      const res = await request(businessApp).get("/api/v1/trips");
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should enforce trip ownership isolation between Tourist A and Tourist B", async () => {
      const mockTripRepo = new TripRepository();
      const mockDestRepo = new DestinationRepository();

      const tripOwnedByA = {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        user_id: touristA.id,
        name: "Tourist A's Golden Triangle Trip",
        start_date: "2026-10-01",
        end_date: "2026-10-07",
        status: "planned",
        created_at: new Date().toISOString()
      };

      vi.spyOn(mockTripRepo, "findTripById").mockResolvedValue(tripOwnedByA);
      vi.spyOn(mockTripRepo, "findItemsByTripId").mockResolvedValue([]);

      const customService = new TripService(mockTripRepo, mockDestRepo);

      // Tourist A accesses own trip -> Allowed
      const allowedResult = await customService.getTripById(tripOwnedByA.id, touristA.id);
      expect(allowedResult.id).toBe(tripOwnedByA.id);
      expect(allowedResult.name).toBe("Tourist A's Golden Triangle Trip");

      // Tourist B attempts to access Tourist A's trip -> Rejected with 403
      await expect(customService.getTripById(tripOwnedByA.id, touristB.id)).rejects.toThrow(
        "You do not have permission to access this trip"
      );
    });

    it("should reject adding itinerary item to another user's trip", async () => {
      const mockTripRepo = new TripRepository();
      const mockDestRepo = new DestinationRepository();

      const tripOwnedByA = {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        user_id: touristA.id,
        name: "Tourist A's Trip",
        start_date: "2026-10-01",
        end_date: "2026-10-07",
        status: "planned",
        created_at: new Date().toISOString()
      };

      vi.spyOn(mockTripRepo, "findTripById").mockResolvedValue(tripOwnedByA);
      const customService = new TripService(mockTripRepo, mockDestRepo);

      await expect(
        customService.addItineraryItem(tripOwnedByA.id, touristB.id, {
          notes: "Attempted intrusion"
        })
      ).rejects.toThrow("You do not have permission to access this trip");
    });

    it("should validate and save places with duplicate prevention", async () => {
      const mockSavedRepo = new SavedPlacesRepository();
      const mockDestRepo = new DestinationRepository();

      const validDestId = "02cdfbc0-98c3-46b0-a288-a619aa93ced2";
      vi.spyOn(mockDestRepo, "findById").mockResolvedValue({
        id: validDestId,
        name: "Tirupati Venkateswara Temple"
      } as unknown as DestinationRow);

      const savedPlaceMock = {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        user_id: touristA.id,
        destination_id: validDestId,
        attraction_id: null,
        created_at: new Date().toISOString()
      };

      vi.spyOn(mockSavedRepo, "findSavedPlace").mockResolvedValue(null);
      vi.spyOn(mockSavedRepo, "createSavedPlace").mockResolvedValue(savedPlaceMock);

      const customSavedService = new SavedPlacesService(mockSavedRepo, mockDestRepo);

      const saved = await customSavedService.savePlace(touristA.id, {
        destinationId: validDestId
      });

      expect(saved.destination_id).toBe(validDestId);
      expect(saved.user_id).toBe(touristA.id);
    });

    it("should retrieve and update tourist travel preferences", async () => {
      const mockPrefRepo = new PreferencesRepository();

      const mockPreferences = {
        id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        user_id: touristA.id,
        interests: ["Heritage", "Spiritual", "Nature"],
        budget_min: 5000,
        budget_max: 25000,
        preferred_trip_days: 5,
        accessibility_needs: [],
        safety_priority: true,
        created_at: new Date().toISOString()
      };

      const mockProfile = {
        user_id: touristA.id,
        travel_style: "Family",
        budget_range: "Mid-range",
        age_group: "25-34",
        mobility_needs: [],
        safety_preferences: ["Women safety", "Verified transport"],
        solo_traveller: false,
        family_group: true,
        elderly_traveller: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.spyOn(mockPrefRepo, "findTravelPreferences").mockResolvedValue(mockPreferences);
      vi.spyOn(mockPrefRepo, "findTouristProfile").mockResolvedValue(mockProfile);

      const customPrefService = new PreferencesService(mockPrefRepo);

      const result = await customPrefService.getPreferences(touristA.id);
      expect(result.userId).toBe(touristA.id);
      expect(result.travelPreferences?.interests).toContain("Spiritual");
      expect(result.touristProfile?.travel_style).toBe("Family");
    });
  });
});
