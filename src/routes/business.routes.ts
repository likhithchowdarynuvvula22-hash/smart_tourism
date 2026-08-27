import { Router } from "express";
import { getDestinationBusinesses, getBusinessById } from "../controllers/business.controller";
import { optionalAuthenticate } from "../middleware/auth";

const router = Router();

// Publicly readable business endpoints (optional authentication for personal preference matching)
router.get("/destinations/:id", optionalAuthenticate(), getDestinationBusinesses);
router.get("/:id", optionalAuthenticate(), getBusinessById);

export default router;
