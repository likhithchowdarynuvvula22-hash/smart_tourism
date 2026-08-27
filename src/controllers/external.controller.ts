import { Request, Response, NextFunction } from "express";
import { weatherService, WeatherService } from "../services/external/weather/weather.service";
import { routingService, RoutingService } from "../services/external/routing/routing.service";
import {
  geocodingService,
  GeocodingService
} from "../services/external/geocoding/geocoding.service";
import {
  translationService,
  TranslationService
} from "../services/external/translation/translation.service";
import { sendSuccess } from "../utils/apiResponse";
import { BadRequestError } from "../utils/appError";

export class ExternalController {
  constructor(
    private readonly weather: WeatherService = weatherService,
    private readonly routing: RoutingService = routingService,
    private readonly geocoding: GeocodingService = geocodingService,
    private readonly translation: TranslationService = translationService
  ) {}

  /**
   * GET /api/v1/weather/destinations/:id
   */
  getDestinationWeather = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = req.params.id as string;
      const date = req.query.date as string | undefined;

      const forecast = await this.weather.getDestinationWeather(id, date);
      sendSuccess(res, forecast, 200, "Destination weather forecast retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/routes
   */
  calculateRoute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { originLat, originLng, destinationLat, destinationLng, originDestId, targetDestId } =
        req.query;

      if (originDestId && targetDestId) {
        const route = await this.routing.calculateBetweenDestinations(
          String(originDestId),
          String(targetDestId)
        );
        sendSuccess(res, route, 200, "Destination route calculated successfully");
        return;
      }

      if (!originLat || !originLng || !destinationLat || !destinationLng) {
        throw new BadRequestError(
          "Required parameters: originLat, originLng, destinationLat, destinationLng (or originDestId & targetDestId)"
        );
      }

      const route = await this.routing.calculateRoute(
        Number(originLat),
        Number(originLng),
        Number(destinationLat),
        Number(destinationLng)
      );

      sendSuccess(res, route, 200, "Driving route calculated successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/geocoding/search
   */
  searchGeocoding = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = (req.query.q || req.query.search) as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 5;

      if (!q) {
        throw new BadRequestError("Query parameter 'q' or 'search' is required");
      }

      const results = await this.geocoding.search(q, limit);
      sendSuccess(res, results, 200, "Geocoding search results retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/translation
   */
  translateText = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { text, sourceLanguage = "en", targetLanguage, sourceLang, targetLang } = req.body;
      const src = sourceLang || sourceLanguage;
      const tgt = targetLang || targetLanguage;

      if (!tgt) {
        throw new BadRequestError("targetLanguage is required");
      }

      const translated = await this.translation.translate(text, src, tgt);
      sendSuccess(res, translated, 200, "Text translated successfully");
    } catch (err) {
      next(err);
    }
  };
}

export const externalController = new ExternalController();
