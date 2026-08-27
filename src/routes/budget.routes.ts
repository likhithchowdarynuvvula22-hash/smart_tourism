import { Router } from "express";
import { budgetController } from "../controllers/budget.controller";
import { optionalAuthenticate } from "../middleware/auth";

const router = Router();

/**
 * @route   GET /api/v1/budget/destinations/:id
 * @desc    Get grounded destination-level budget and cost assessment
 * @access  Public (Optionally uses user preferences if authenticated)
 */
router.get("/destinations/:id", optionalAuthenticate(), budgetController.getDestinationBudget);

/**
 * @route   GET /api/v1/budget/destinations/:id/fees
 * @desc    Get attraction-level entry fee catalog for a destination
 * @access  Public
 */
router.get("/destinations/:id/fees", budgetController.getAttractionFees);

/**
 * @route   POST /api/v1/budget/calculate
 * @desc    Calculate custom grounded budget across specified attractions
 * @access  Public (Optionally uses user preferences if authenticated)
 */
router.post("/calculate", optionalAuthenticate(), budgetController.calculateCustomBudget);

export default router;
