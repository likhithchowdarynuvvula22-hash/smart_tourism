import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config";
import { requestLogger } from "./middleware/requestLogger";
import { notFoundHandler } from "./middleware/notFoundHandler";
import { errorHandler } from "./middleware/errorHandler";
import routes from "./routes";

import path from "path";

export const createApp = (): Application => {
  const app = express();

  // Security headers
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS configuration
  const allowedOrigins = (env.FRONTEND_ORIGINS || env.CORS_ORIGIN || "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const isWildcard = allowedOrigins.includes("*");

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isWildcard || env.NODE_ENV !== "production") {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("CORS origin not allowed by policy"));
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
      credentials: true
    })
  );

  // Request body parsing with safe 500kb limits
  app.use(express.json({ limit: "500kb" }));
  app.use(express.urlencoded({ extended: true, limit: "500kb" }));

  // HTTP request logging
  app.use(requestLogger);

  // API Routes
  app.use(routes);

  // Static frontend portal files (UI showcase)
  const frontendDir = path.resolve(__dirname, "../frontend");
  app.use(express.static(frontendDir));

  // 404 handler for unknown routes
  app.use(notFoundHandler);

  // Centralized Error handler
  app.use(errorHandler);

  return app;
};

export default createApp();
