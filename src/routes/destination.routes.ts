import { Router } from "express";
import { destinationController } from "../controllers/destination.controller";

const router = Router();

// Catalog list & search
router.get("/", destinationController.getDestinations);

// All unique states & destination counts
router.get("/states", destinationController.getStates);

// Single destination details
router.get("/:id", destinationController.getDestinationById);

// Relational tourism information
router.get("/:id/attractions", destinationController.getAttractions);
router.get("/:id/experiences", destinationController.getExperiences);
router.get("/:id/opening-hours", destinationController.getOpeningHours);
router.get("/:id/entry-fees", destinationController.getEntryFees);
router.get("/:id/accessibility", destinationController.getAccessibility);
router.get("/:id/elderly-support", destinationController.getElderlySupport);
router.get("/:id/images", destinationController.getImages);
router.get("/:id/languages", destinationController.getLanguages);

// Safety & Emergency
router.get("/:id/safety", destinationController.getSafety);
router.get("/:id/emergency-resources", destinationController.getEmergencyResources);

// Local businesses
router.get("/:id/businesses", destinationController.getLocalBusinesses);
router.get("/:id/local-businesses", destinationController.getLocalBusinesses);

export default router;
