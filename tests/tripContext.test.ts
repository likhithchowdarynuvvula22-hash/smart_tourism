import { describe, it, expect, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "../src/utils/appError";
import { TravellerContextBuilder } from "../src/services/ai/context/travellerContext.builder";
import { PreferencesService } from "../src/services/preferences.service";
import { UserRepository } from "../src/repositories/user.repository";
import { TripService } from "../src/services/trip.service";
import { SavedPlacesService } from "../src/services/savedPlaces.service";
import { AuthenticatedUser } from "../src/types/auth";

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

const TRIP_A = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  user_id: touristA.id,
  name: "Araku Getaway",
  start_date: "2026-11-01",
  end_date: "2026-11-03",
  status: "planned",
  created_at: new Date().toISOString(),
  items: [{ id: "item-1" }, { id: "item-2" }]
};

const buildStack = () => {
  const prefsService = {
    getPreferences: vi.fn().mockResolvedValue({
      userId: touristA.id,
      travelPreferences: null,
      touristProfile: null
    }),
    updatePreferences: vi.fn()
  } as unknown as PreferencesService;

  const usersRepo = {
    findProfileById: vi.fn().mockResolvedValue({ preferred_language: null })
  } as unknown as UserRepository;

  const tripsService = new TripService();
  const placesService = new SavedPlacesService();

  // Ownership semantics identical to the real TripService:
  vi.spyOn(tripsService, "getTripById").mockImplementation(async (tripId, userId) => {
    if (tripId !== TRIP_A.id) throw new NotFoundError("Trip not found");
    if (userId !== touristA.id) {
      throw new ForbiddenError("You do not have permission to access this trip");
    }
    return { ...TRIP_A, items: [...TRIP_A.items] };
  });
  vi.spyOn(tripsService, "getTrips").mockImplementation(async (userId) =>
    userId === touristA.id ? [TRIP_A] : []
  );
  vi.spyOn(placesService, "getSavedPlaces").mockResolvedValue([
    {
      id: "sp-1",
      user_id: touristA.id,
      destination_id: "dest-1",
      attraction_id: null,
      created_at: new Date().toISOString(),
      destination: { name: "Araku Valley" }
    }
  ] as never);

  const builder = new TravellerContextBuilder(prefsService, usersRepo, tripsService, placesService);
  return { builder, tripsService, placesService };
};

describe("Phase 8B: Trip Context Feedback Loop Suite", () => {
  it("16. loads the user's OWN trip context by explicit reference", async () => {
    const { builder } = buildStack();
    const ctx = await builder.buildContext({
      entities: {},
      intent: "itinerary_help",
      user: touristA,
      tripId: TRIP_A.id
    });
    expect(ctx.activeTrip).not.toBeNull();
    expect(ctx.activeTrip!.tripId).toBe(TRIP_A.id);
    expect(ctx.activeTrip!.name).toBe("Araku Getaway");
    expect(ctx.tripContext.tripId.value).toBe(TRIP_A.id);
    expect(ctx.tripContext.tripId.source).toBe("trip_context");
  });

  it("17. rejects another user's trip context (ownership enforced)", async () => {
    const { builder } = buildStack();
    const ctx = await builder.buildContext({
      entities: {},
      intent: "itinerary_help",
      user: touristB,
      tripId: TRIP_A.id
    });
    expect(ctx.activeTrip).toBeNull();
    expect(ctx.tripContext.tripId.value).toBeNull();
  });

  it("18. trip dates flow into normalized travelDates", async () => {
    const { builder } = buildStack();
    const ctx = await builder.buildContext({
      entities: {},
      intent: "itinerary_help",
      user: touristA,
      tripId: TRIP_A.id
    });
    expect(ctx.tripContext.travelDates.start.value).toBe("2026-11-01");
    expect(ctx.tripContext.travelDates.end.value).toBe("2026-11-03");
    expect(ctx.activeTrip!.durationDays).toBe(3);
  });

  it("19. itinerary item count is loaded with the trip", async () => {
    const { builder } = buildStack();
    const ctx = await builder.buildContext({
      entities: {},
      intent: "itinerary_help",
      user: touristA,
      tripId: TRIP_A.id
    });
    expect(ctx.activeTrip!.itineraryItemCount).toBe(2);
  });

  it("20. saved places are attached as bounded advisory context", async () => {
    const { builder } = buildStack();
    const ctx = await builder.buildContext({
      entities: {},
      intent: "itinerary_help",
      user: touristA,
      tripId: TRIP_A.id
    });
    expect(ctx.activeTrip!.savedPlaceNames).toEqual(["Araku Valley"]);
  });

  it("21. nonexistent trip degrades safely to null context", async () => {
    const { builder } = buildStack();
    const ctx = await builder.buildContext({
      entities: {},
      intent: "itinerary_help",
      user: touristA,
      tripId: "99999999-9999-4999-8999-999999999999"
    });
    expect(ctx.activeTrip).toBeNull();
    expect(ctx.tripContext.tripId.source).toBe("unknown");
  });

  it("22. no-trip requests carry safe empty trip context", async () => {
    const { builder } = buildStack();
    const ctx = await builder.buildContext({
      entities: {},
      intent: "trip_planning",
      user: touristA
    });
    expect(ctx.activeTrip).toBeNull();
    expect(ctx.tripContext.tripId.source).toBe("unknown");
    expect(ctx.unknownUserData).toContain("tripContext.travelDates.start");
  });
});
