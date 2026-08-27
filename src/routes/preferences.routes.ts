import { Router } from "express";
import { preferencesController } from "../controllers/preferences.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

router.get(
  "/preferences",
  authenticate(),
  requireRole("tourist"),
  preferencesController.getPreferences
);
router.put(
  "/preferences",
  authenticate(),
  requireRole("tourist"),
  preferencesController.updatePreferences
);

export default router;
