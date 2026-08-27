import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../lib/logger";

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  (req as Request & { id?: string }).id = requestId;
  res.setHeader("X-Request-Id", requestId);

  // Hook writeHead to set X-Response-Time before headers are written
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function (this: Response, ...args: [statusCode: number, ...rest: unknown[]]) {
    const duration = Date.now() - start;
    if (!res.headersSent) {
      res.setHeader("X-Response-Time", `${duration}ms`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (originalWriteHead as any)(...args);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    const { method, originalUrl, ip } = req;
    const { statusCode } = res;

    const logData = {
      requestId,
      method,
      url: originalUrl,
      status: statusCode,
      durationMs: duration,
      ip
    };

    if (statusCode >= 500) {
      logger.error(logData, `HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`);
    } else if (statusCode >= 400) {
      logger.warn(logData, `HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`);
    } else {
      logger.info(logData, `HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`);
    }
  });

  next();
};
