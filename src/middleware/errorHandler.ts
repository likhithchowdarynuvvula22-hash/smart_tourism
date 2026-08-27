import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/appError";
import { sendError } from "../utils/apiResponse";
import { logger } from "../lib/logger";
import { env } from "../config";

interface ExpressError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
  code?: string;
  details?: unknown;
}

export const errorHandler = (
  err: ExpressError | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isDev = env.NODE_ENV === "development";
  const isAppError = err instanceof AppError;

  let statusCode = isAppError ? err.statusCode : err.status || err.statusCode || 500;
  let code = isAppError ? err.code : err.code || "INTERNAL_SERVER_ERROR";
  let message = err.message || "An unexpected server error occurred";
  let details = isAppError ? err.details : err.details;

  // Handle body-parser entity too large (HTTP 413)
  if (("type" in err && err.type === "entity.too.large") || statusCode === 413) {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request payload exceeds the maximum allowed limit";
    details = undefined;
  }

  // Handle body-parser malformed JSON syntax error (HTTP 400)
  if (err instanceof SyntaxError && "body" in err && statusCode === 400) {
    statusCode = 400;
    code = "BAD_REQUEST";
    message = "Malformed JSON request body";
    details = undefined;
  }

  // Production error sanitization (prevent SQL, internal paths, raw provider leak)
  if (!isDev) {
    // If it's an unhandled 500 or Postgres/database internal error
    if (statusCode >= 500) {
      if (
        message.toLowerCase().includes("select") ||
        message.toLowerCase().includes("postgres") ||
        message.toLowerCase().includes("supabase") ||
        message.toLowerCase().includes("table") ||
        message.toLowerCase().includes("relation") ||
        (err.code && typeof err.code === "string" && err.code.startsWith("PGRST"))
      ) {
        code = "DATABASE_ERROR";
        message = "Database service encountered an error";
        details = undefined;
      } else if (!isAppError) {
        code = "INTERNAL_SERVER_ERROR";
        message = "An unexpected internal server error occurred";
        details = undefined;
      }
    }
  }

  logger.error(
    {
      err: {
        message: err.message,
        name: err.name,
        stack: err.stack,
        code
      },
      request: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip
      }
    },
    `Error processing request: ${err.message}`
  );

  sendError(res, message, statusCode, code, details, isDev ? err.stack : undefined);
};
