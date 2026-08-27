import { Router } from "express";
import {
  getDestinationGallery,
  getDestinationSummary,
  getMultilingualContent
} from "../controllers/content.controller";
import { optionalAuthenticate } from "../middleware/auth";

const router = Router();

// Publicly readable content endpoints
router.get("/destinations/:id/images", optionalAuthenticate(), getDestinationGallery);
router.get("/destinations/:id/summary", optionalAuthenticate(), getDestinationSummary);
router.get("/destinations/:id/multilingual", optionalAuthenticate(), getMultilingualContent);

export default router;
