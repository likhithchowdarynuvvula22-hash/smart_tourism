import { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError } from "../utils/apiResponse";
import { HealthCheckData } from "../types/api";
import { env } from "../config";
import { checkDatabaseConnection } from "../lib/supabase";

export const getHealth = (_req: Request, res: Response): void => {
  const data: HealthCheckData = {
    status: "healthy",
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: "sih-tourism-backend",
    version: "1.0.0"
  };

  sendSuccess(res, data, 200, "SIH Smart Tourism Platform Backend is operational");
};

export const getDbHealth = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const dbCheck = await checkDatabaseConnection();

    if (dbCheck.status === "connected") {
      sendSuccess(res, dbCheck, 200, "Supabase database connection is healthy");
    } else {
      sendError(
        res,
        dbCheck.error || "Supabase database connection failed",
        503,
        "DATABASE_UNAVAILABLE",
        { verifiedTable: dbCheck.verifiedTable, latencyMs: dbCheck.latencyMs }
      );
    }
  } catch (err) {
    next(err);
  }
};

export const getReadiness = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const dbCheck = await checkDatabaseConnection();

    if (dbCheck.status === "connected") {
      sendSuccess(
        res,
        {
          status: "ready",
          environment: env.NODE_ENV,
          checks: {
            server: "ready",
            database: "connected"
          },
          timestamp: new Date().toISOString()
        },
        200,
        "Service is ready to receive traffic"
      );
    } else {
      sendError(
        res,
        "Service is not ready (database connection incomplete)",
        503,
        "SERVICE_UNAVAILABLE",
        {
          status: "not_ready",
          checks: {
            server: "ready",
            database: dbCheck.error || "disconnected"
          }
        }
      );
    }
  } catch (err) {
    next(err);
  }
};
