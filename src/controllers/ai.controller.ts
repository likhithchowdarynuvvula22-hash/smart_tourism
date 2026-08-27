import { Request, Response, NextFunction } from "express";
import { orchestratorService, OrchestratorService } from "../services/ai/orchestrator.service";
import { sendSuccess } from "../utils/apiResponse";
import { BadRequestError } from "../utils/appError";

export class AIController {
  constructor(private readonly orchestrator: OrchestratorService = orchestratorService) {}

  /**
   * POST /api/v1/ai/chat
   */
  chat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { message } = req.body;

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        throw new BadRequestError("Field 'message' is required and must be a non-empty string");
      }

      // Phase 8C — optional structured destination confirmation (validated
      // downstream against the resolved candidate context; non-UUID entries
      // are rejected there and disclosed in warnings).
      let selectedDestinationIds: string[] | undefined;
      if (Array.isArray(req.body.selectedDestinationIds)) {
        selectedDestinationIds = req.body.selectedDestinationIds.map(String).slice(0, 5);
      }

      const response = await this.orchestrator.chat(message, req.user, { selectedDestinationIds });
      sendSuccess(res, response, 200, "AI tourism guidance generated successfully");
    } catch (err) {
      next(err);
    }
  };
}

export const aiController = new AIController();
