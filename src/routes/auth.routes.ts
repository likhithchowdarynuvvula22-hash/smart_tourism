import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

// Current user profile
router.get("/me", authenticate(), authController.getMe);

// Role verification test probes
router.get(
  "/verify/tourist",
  authenticate(),
  requireRole("tourist"),
  authController.verifyRoleTourist
);

router.get(
  "/verify/business",
  authenticate(),
  requireRole("business"),
  authController.verifyRoleBusiness
);

router.get("/verify/admin", authenticate(), requireRole("admin"), authController.verifyRoleAdmin);

export default router;
