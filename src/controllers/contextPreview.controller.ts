import { Request, Response, NextFunction } from "express";
import {
  travellerContextBuilder,
  TravellerContextBuilder
} from "../services/ai/context/travellerContext.builder";
import { constraintEngine, ConstraintEngine } from "../services/ai/context/constraint.engine";
import { ContextPreviewDto } from "../types/travellerContext";
import { sendSuccess } from "../utils/apiResponse";
import { UnauthorizedError } from "../utils/appError";

/**
 * Phase 8B — GET /api/v1/ai/context-preview
 *
 * Protected transparency endpoint: returns ONLY the authenticated user's own
 * normalized traveller context. Read-only; never persists anything and never
 * invokes the LLM.
 */
export class ContextPreviewController {
  constructor(
    private readonly builder: TravellerContextBuilder = travellerContextBuilder,
    private readonly engine: ConstraintEngine = constraintEngine
  ) {}

  getContextPreview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to view your traveller context");
      }

      const context = await this.builder.buildContext({
        entities: {},
        intent: "general_tourism_query",
        user: req.user,
        forceStoredLoad: true // transparency endpoint explicitly shows what is stored
      });
      const resolution = this.engine.resolveConstraints(context);

      const dto: ContextPreviewDto = {
        identity: {
          authenticated: context.identity.authenticated,
          role: context.identity.role
        },
        storedPreferences: {
          language:
            context.travellerProfile.preferredLanguage.source === "unknown"
              ? null
              : context.travellerProfile.preferredLanguage.value,
          interests: [...context.travellerProfile.interests.value],
          accessibilityNeeds: [...context.travellerProfile.accessibilityNeeds.value],
          budget: {
            min: null,
            max: context.budget.amount.value
          },
          preferredTripDays:
            context.tripContext.durationDays.source === "stored_preference"
              ? context.tripContext.durationDays.value
              : null,
          travelStyle: context.travellerProfile.travelStyle.value
        },
        travellerContext: this.engine.toSafeSummary(context, resolution),
        constraints: {
          hard: resolution.hardConstraints.map((c) => `${c.id}: ${c.description}`),
          soft: resolution.softPreferences.map((c) => `${c.id}: ${c.description}`),
          objectives: resolution.objectives.map((c) => `${c.id}: ${c.description}`)
        },
        unknowns: [...context.unknownUserData]
      };

      sendSuccess(res, dto, 200, "Traveller context preview retrieved successfully");
    } catch (err) {
      next(err);
    }
  };
}

export const contextPreviewController = new ContextPreviewController();
