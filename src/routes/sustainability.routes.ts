import { Router } from "express";
import { optionalAuthenticate } from "../middleware/auth";
import { getDestinationSustainability } from "../controllers/sustainability.controller";

const router = Router();

/**
 * GET /api/v1/sustainability/destinations/:id
 * Public sustainability assessment — no auth required.
 * Optional auth enables user preference enrichment in future phases.
 */
router.get("/destinations/:id", optionalAuthenticate(), getDestinationSustainability);

export default router;
