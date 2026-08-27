import { Request, Response, NextFunction } from "express";
import { authService, AuthService } from "../services/auth.service";
import { sendSuccess } from "../utils/apiResponse";
import { UnauthorizedError } from "../utils/appError";

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  /**
   * GET /api/v1/auth/me
   * Returns current authenticated user profile, roles, and preferences.
   */
  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.scopedSupabase) {
        throw new UnauthorizedError("Authentication required to retrieve profile");
      }

      const fullProfile = await this.service.getFullUserProfile(req.user, req.scopedSupabase);

      sendSuccess(res, fullProfile, 200, "Authenticated user profile retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/auth/verify/tourist
   * Role verification probe for tourist.
   */
  verifyRoleTourist = (req: Request, res: Response): void => {
    sendSuccess(
      res,
      {
        verified: true,
        role: "tourist",
        userId: req.user?.id
      },
      200,
      "Tourist access verified successfully"
    );
  };

  /**
   * GET /api/v1/auth/verify/business
   * Role verification probe for business.
   */
  verifyRoleBusiness = (req: Request, res: Response): void => {
    sendSuccess(
      res,
      {
        verified: true,
        role: "business",
        userId: req.user?.id
      },
      200,
      "Business access verified successfully"
    );
  };

  /**
   * GET /api/v1/auth/verify/admin
   * Role verification probe for admin.
   */
  verifyRoleAdmin = (req: Request, res: Response): void => {
    sendSuccess(
      res,
      {
        verified: true,
        role: "admin",
        userId: req.user?.id
      },
      200,
      "Admin access verified successfully"
    );
  };
}

export const authController = new AuthController();
