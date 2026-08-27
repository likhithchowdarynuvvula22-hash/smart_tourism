import { Router } from "express";
import { savedPlacesController } from "../controllers/savedPlaces.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

router.post("/", authenticate(), requireRole("tourist"), savedPlacesController.savePlace);
router.get("/", authenticate(), requireRole("tourist"), savedPlacesController.getSavedPlaces);
router.delete(
  "/:id",
  authenticate(),
  requireRole("tourist"),
  savedPlacesController.removeSavedPlace
);

export default router;
