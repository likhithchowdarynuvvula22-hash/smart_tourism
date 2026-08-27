import { Router } from "express";
import { externalController } from "../controllers/external.controller";

export const weatherRouter = Router();
weatherRouter.get("/destinations/:id", externalController.getDestinationWeather);

export const routesRouter = Router();
routesRouter.get("/", externalController.calculateRoute);

export const geocodingRouter = Router();
geocodingRouter.get("/search", externalController.searchGeocoding);

export const translationRouter = Router();
translationRouter.post("/", externalController.translateText);
