import { Router } from "express";
import healthRoutes from "./health.routes";
import authRoutes from "./auth.routes";
import destinationRoutes from "./destination.routes";
import tripRoutes from "./trip.routes";
import savedPlacesRoutes from "./savedPlaces.routes";
import preferencesRoutes from "./preferences.routes";
import { weatherRouter, routesRouter, geocodingRouter, translationRouter } from "./external.routes";
import aiRoutes from "./ai.routes";
import crowdRoutes from "./crowd.routes";
import safetyRoutes from "./safety.routes";
import accessibilityRoutes from "./accessibility.routes";
import budgetRoutes from "./budget.routes";
import experienceRoutes from "./experience.routes";
import contentRoutes from "./content.routes";
import businessRoutes from "./business.routes";
import sustainabilityRoutes from "./sustainability.routes";
import {
  publicReadLimiter,
  aiRequestLimiter,
  authRequestLimiter,
  writeRequestLimiter,
  healthRequestLimiter
} from "../middleware/rateLimiter";

const router = Router();

// Health routes (root and versioned)
router.use("/", healthRequestLimiter, healthRoutes);

// Authentication & Profile routes
router.use("/api/v1/auth", authRequestLimiter, authRoutes);

// Core Tourism Read APIs
router.use("/api/v1/destinations", publicReadLimiter, destinationRoutes);

// Tourist Planning & Personalization APIs
router.use("/api/v1/trips", writeRequestLimiter, tripRoutes);
router.use("/api/v1/saved-places", writeRequestLimiter, savedPlacesRoutes);
router.use("/api/v1/tourist", writeRequestLimiter, preferencesRoutes);

// External / Real-Time APIs (Phase 5)
router.use("/api/v1/weather", publicReadLimiter, weatherRouter);
router.use("/api/v1/routes", publicReadLimiter, routesRouter);
router.use("/api/v1/geocoding", publicReadLimiter, geocodingRouter);
router.use("/api/v1/translation", publicReadLimiter, translationRouter);

// AI Tourism Orchestrator APIs (Phase 6)
router.use("/api/v1/ai", aiRequestLimiter, aiRoutes);

// Crowd Intelligence & Visiting-Time Forecasting APIs (Phase 7A)
router.use("/api/v1/crowd", publicReadLimiter, crowdRoutes);

// Women Safety Intelligence APIs (Phase 7B)
router.use("/api/v1/safety/women", publicReadLimiter, safetyRoutes);

// Elderly & Accessibility Travel Intelligence APIs (Phase 7C)
router.use("/api/v1/accessibility", publicReadLimiter, accessibilityRoutes);

// Budget & Cost Intelligence APIs (Phase 7D)
router.use("/api/v1/budget", publicReadLimiter, budgetRoutes);

// Cultural & Experience Intelligence APIs (Phase 7E)
router.use("/api/v1/experiences", publicReadLimiter, experienceRoutes);

// Multi-Modal & Content Intelligence APIs (Phase 7F)
router.use("/api/v1/content", publicReadLimiter, contentRoutes);

// Local Business & Local Economy Intelligence APIs (Phase 7G)
router.use("/api/v1/businesses", publicReadLimiter, businessRoutes);

// Sustainability, Eco-Tourism & Carbon Intelligence APIs (Phase 7H)
router.use("/api/v1/sustainability", publicReadLimiter, sustainabilityRoutes);

export default router;
