import { Router } from "express";
import { getHealth, getDbHealth, getReadiness } from "../controllers/health.controller";

const router = Router();

router.get("/health", getHealth);
router.get("/health/db", getDbHealth);
router.get("/ready", getReadiness);

router.get("/api/v1/health", getHealth);
router.get("/api/v1/health/db", getDbHealth);
router.get("/api/v1/ready", getReadiness);

export default router;
