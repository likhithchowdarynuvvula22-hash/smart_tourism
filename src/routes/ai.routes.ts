import { Router } from "express";
import { aiController } from "../controllers/ai.controller";
import { contextPreviewController } from "../controllers/contextPreview.controller";
import { optionalAuthenticate, authenticate } from "../middleware/auth";

const router = Router();

// POST /api/v1/ai/chat (Supports optional user authentication context)
router.post("/chat", optionalAuthenticate(), aiController.chat);

// GET /api/v1/ai/context-preview (Phase 8B — protected transparency endpoint)
router.get("/context-preview", authenticate(), contextPreviewController.getContextPreview);

export default router;
