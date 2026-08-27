import { Router } from "express";
import { experienceController } from "../controllers/experience.controller";
import { optionalAuthenticate } from "../middleware/auth";

const router = Router();

/**
 * @route   GET /api/v1/experiences/categories
 * @desc    Get supported experience categories and ontology
 * @access  Public
 */
router.get("/categories", experienceController.getCategories);

/**
 * @route   GET /api/v1/experiences/destinations/:id
 * @desc    Get verified experiences and cultural intelligence for a destination
 * @access  Public (Optionally uses user preferences if authenticated)
 */
router.get(
  "/destinations/:id",
  optionalAuthenticate(),
  experienceController.getDestinationExperiences
);

/**
 * @route   POST /api/v1/experiences/rank
 * @desc    Rank custom candidate items according to preferences
 * @access  Public
 */
router.post("/rank", experienceController.rankCandidates);

export default router;
