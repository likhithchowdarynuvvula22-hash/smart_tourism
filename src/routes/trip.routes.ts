import { Router } from "express";
import { tripController } from "../controllers/trip.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

// Trips CRUD
router.post("/", authenticate(), requireRole("tourist"), tripController.createTrip);
router.get("/", authenticate(), requireRole("tourist"), tripController.getTrips);
router.get("/:id", authenticate(), requireRole("tourist"), tripController.getTripById);
router.put("/:id", authenticate(), requireRole("tourist"), tripController.updateTrip);
router.delete("/:id", authenticate(), requireRole("tourist"), tripController.deleteTrip);

// Itinerary Items within Trips
router.post("/:id/items", authenticate(), requireRole("tourist"), tripController.addItineraryItem);
router.get("/:id/items", authenticate(), requireRole("tourist"), tripController.getItineraryItems);
router.put(
  "/:id/items/:itemId",
  authenticate(),
  requireRole("tourist"),
  tripController.updateItineraryItem
);
router.delete(
  "/:id/items/:itemId",
  authenticate(),
  requireRole("tourist"),
  tripController.deleteItineraryItem
);

export default router;
