import { Router } from "express";
import {
  getDestinationAccessibility,
  getAttractionAccessibility,
  getDestinationElderlySupport
} from "../controllers/accessibility.controller";

const router = Router();

/**
 * @route   GET /api/v1/accessibility/destinations/:id
 * @desc    Get grounded destination-level accessibility intelligence
 * @access  Public
 */
router.get("/destinations/:id", getDestinationAccessibility);

/**
 * @route   GET /api/v1/accessibility/destinations/:id/attractions
 * @desc    Get attraction-level accessibility features for a destination
 * @access  Public
 */
router.get("/destinations/:id/attractions", getAttractionAccessibility);

/**
 * @route   GET /api/v1/accessibility/destinations/:id/elderly
 * @desc    Get destination-level elderly and senior citizen travel suitability
 * @access  Public
 */
router.get("/destinations/:id/elderly", getDestinationElderlySupport);

export default router;
