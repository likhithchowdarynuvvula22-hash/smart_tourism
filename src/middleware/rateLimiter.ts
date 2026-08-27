import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/apiResponse";

export interface RateLimitOptions {
  windowMs: number; // Time frame in milliseconds
  max: number; // Max requests per windowMs
  category:
    "PUBLIC_READ" | "AI_REQUEST" | "AUTH_REQUEST" | "WRITE_REQUEST" | "HEALTH_REQUEST" | string;
  message?: string;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

class InMemoryRateLimiter {
  private stores: Map<string, Map<string, ClientRecord>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run background cleanup every 2 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 120000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Resets all rate limit stores. Useful for test isolation.
   */
  reset(): void {
    this.stores.clear();
  }

  /**
   * Resets a specific category store.
   */
  resetCategory(category: string): void {
    this.stores.delete(category);
  }

  /**
   * Cleans up expired entries across all categories.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [category, store] of this.stores.entries()) {
      for (const [clientKey, record] of store.entries()) {
        if (now > record.resetTime) {
          store.delete(clientKey);
        }
      }
      if (store.size === 0) {
        this.stores.delete(category);
      }
    }
  }

  /**
   * Creates an Express middleware for rate limiting.
   */
  createMiddleware(options: RateLimitOptions) {
    const {
      windowMs,
      max,
      category,
      message = "Too many requests. Please try again later."
    } = options;

    return (req: Request, res: Response, next: NextFunction): void => {
      const now = Date.now();

      // Resolve client identity: authenticated user ID + IP or just IP
      const clientIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
      const clientId = req.user?.id ? `user:${req.user.id}:${clientIp}` : `ip:${clientIp}`;

      let store = this.stores.get(category);
      if (!store) {
        store = new Map<string, ClientRecord>();
        this.stores.set(category, store);
      }

      let record = store.get(clientId);

      if (!record || now > record.resetTime) {
        // Initial request or window expired
        record = {
          count: 1,
          resetTime: now + windowMs
        };
        store.set(clientId, record);
        res.setHeader("X-RateLimit-Limit", max.toString());
        res.setHeader("X-RateLimit-Remaining", Math.max(0, max - 1).toString());
        res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000).toString());
        return next();
      }

      if (record.count >= max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
        res.setHeader("Retry-After", retryAfterSeconds.toString());
        res.setHeader("X-RateLimit-Limit", max.toString());
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000).toString());

        sendError(res, message, 429, "RATE_LIMITED");
        return;
      }

      record.count += 1;
      const remaining = Math.max(0, max - record.count);
      res.setHeader("X-RateLimit-Limit", max.toString());
      res.setHeader("X-RateLimit-Remaining", remaining.toString());
      res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000).toString());

      return next();
    };
  }
}

export const rateLimiterStore = new InMemoryRateLimiter();

/**
 * Resets all rate limit stores across the application.
 */
export const resetRateLimits = (): void => {
  rateLimiterStore.reset();
};

/**
 * Standard category rate limiters:
 */
export const publicReadLimiter = rateLimiterStore.createMiddleware({
  category: "PUBLIC_READ",
  windowMs: 60000,
  max: 100,
  message: "Too many requests. Please try again later."
});

export const aiRequestLimiter = rateLimiterStore.createMiddleware({
  category: "AI_REQUEST",
  windowMs: 60000,
  max: 20,
  message: "Too many AI requests. Please try again later."
});

export const authRequestLimiter = rateLimiterStore.createMiddleware({
  category: "AUTH_REQUEST",
  windowMs: 60000,
  max: 10,
  message: "Too many authentication attempts. Please try again later."
});

export const writeRequestLimiter = rateLimiterStore.createMiddleware({
  category: "WRITE_REQUEST",
  windowMs: 60000,
  max: 30,
  message: "Too many write requests. Please try again later."
});

export const healthRequestLimiter = rateLimiterStore.createMiddleware({
  category: "HEALTH_REQUEST",
  windowMs: 60000,
  max: 300,
  message: "Too many health check requests."
});
