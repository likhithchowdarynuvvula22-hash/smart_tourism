import { Router } from "express";
import { getDestinationCrowd } from "../controllers/crowd.controller";

const router = Router();

// GET /api/v1/crowd/destinations/:id
router.get("/destinations/:id", getDestinationCrowd);

export default router;
