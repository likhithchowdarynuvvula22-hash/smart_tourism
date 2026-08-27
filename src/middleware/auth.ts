import { Request, Response, NextFunction } from "express";
import { authService, AuthService } from "../services/auth.service";
import { AppRole } from "../types/auth";
import { UnauthorizedError, ForbiddenError } from "../utils/appError";
import { logger } from "../lib/logger";

/**
 * Helper to safely extract Bearer token from the Authorization header.
 */
export const extractBearerToken = (req: Request): string | null => {
  if (!req || !req.headers) {
    return null;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }

  // Reject ambiguous duplicate/comma-separated authorization headers
  if (authHeader.includes(",")) {
    return null;
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }

  const token = parts[1].trim();
  if (!token) {
    return null;
  }

  return token;
};

/**
 * Authentication Middleware:
 * 1. Reads Authorization: Bearer <token>
 * 2. Validates token via Supabase Auth
 * 3. Creates a scoped Supabase client preserving user RLS context
 * 4. Resolves user roles from user_roles table
 * 5. Attaches req.user and req.scopedSupabase
 */
export const authenticate = (service: AuthService = authService) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user && req.user.id) {
        return next();
      }

      const token = extractBearerToken(req);

      if (!token) {
        throw new UnauthorizedError(
          "Missing or malformed Authorization header. Expected format: Bearer <token>"
        );
      }

      const authUser = await service.validateToken(token);
      const scopedClient = service.createScopedClient(token);
      const userContext = await service.resolveUserContext(authUser, scopedClient);

      req.user = userContext;
      req.scopedSupabase = scopedClient;

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Optional Authentication Middleware:
 * If a valid token is provided, populates req.user; otherwise continues as an anonymous request.
 */
export const optionalAuthenticate = (service: AuthService = authService) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractBearerToken(req);
      if (token) {
        const authUser = await service.validateToken(token);
        const scopedClient = service.createScopedClient(token);
        const userContext = await service.resolveUserContext(authUser, scopedClient);
        req.user = userContext;
        req.scopedSupabase = scopedClient;
      }
    } catch (err) {
      logger.debug({ err }, "Optional authentication token ignored due to validation failure");
    }
    next();
  };
};

/**
 * Enforces that the request has an active authenticated user context.
 */
export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user || !req.user.id) {
    return next(new UnauthorizedError("Authentication required to access this resource"));
  }
  next();
};

/**
 * Role-Based Access Control (RBAC) Middleware.
 * Enforces that the authenticated user possesses at least one of the allowed application roles.
 */
export const requireRole = (...allowedRoles: AppRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.id) {
      return next(new UnauthorizedError("Authentication required for role verification"));
    }

    const userRoles = req.user.roles || [];
    const primaryRole = req.user.role;

    const hasAllowedRole = allowedRoles.some(
      (role) => userRoles.includes(role) || primaryRole === role
    );

    if (!hasAllowedRole) {
      return next(
        new ForbiddenError(
          `Forbidden: Insufficient permissions. Required one of: [${allowedRoles.join(", ")}]`,
          {
            requiredRoles: allowedRoles,
            assignedRoles: userRoles
          }
        )
      );
    }

    next();
  };
};
