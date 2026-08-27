import { Router } from "express";
import { getDestinationWomenSafety } from "../controllers/safety.controller";

const router = Router();

// GET /api/v1/safety/women/destinations/:id
router.get("/destinations/:id", getDestinationWomenSafety);

export default router;
