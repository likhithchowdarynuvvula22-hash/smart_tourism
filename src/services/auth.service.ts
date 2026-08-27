import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { env } from "../config";
import { supabase } from "../lib/supabase";
import { Database } from "../types/database.types";
import { AuthenticatedUser, AppRole, FullUserProfileDto } from "../types/auth";
import { userRepository, UserRepository } from "../repositories/user.repository";
import { UnauthorizedError } from "../utils/appError";
import { logger } from "../lib/logger";

export class AuthService {
  constructor(private readonly userRepo: UserRepository = userRepository) {}

  /**
   * Creates a request-scoped Supabase client that forwards the user's Bearer token.
   * This guarantees that all PostgREST queries evaluate under auth.uid() = user.id (RLS).
   */
  createScopedClient(token: string): SupabaseClient<Database> {
    return createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
  }

  /**
   * Validates a Supabase JWT token against the Supabase Auth service.
   */
  async validateToken(token: string): Promise<User> {
    if (!token || typeof token !== "string" || token.trim().length === 0) {
      throw new UnauthorizedError("Authentication token is missing or empty");
    }

    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn({ error: error?.message }, "Failed to validate Supabase authentication token");
      throw new UnauthorizedError(error?.message || "Invalid or expired authentication token");
    }

    return user;
  }

  /**
   * Resolves the authenticated user context, including roles from the user_roles table.
   */
  async resolveUserContext(
    user: User,
    scopedClient: SupabaseClient<Database>
  ): Promise<AuthenticatedUser> {
    let roles: AppRole[] = [];

    try {
      roles = await this.userRepo.findRolesByUserId(user.id, scopedClient);
    } catch (err) {
      logger.warn(
        { err, userId: user.id },
        "Could not resolve roles from user_roles table; checking metadata"
      );
    }

    // Secondary fallback to verified app_metadata or user_metadata if user_roles has not been seeded yet
    if (roles.length === 0) {
      const metaRole = (user.app_metadata?.role || user.user_metadata?.role) as string | undefined;
      if (metaRole) {
        const lower = metaRole.toLowerCase() as AppRole;
        if (["tourist", "business", "admin"].includes(lower)) {
          roles.push(lower);
        }
      }
    }

    // Default primary role: highest privilege if multiple, or first role, or null
    const primaryRole: AppRole | null = roles.includes("admin")
      ? "admin"
      : roles.includes("business")
        ? "business"
        : roles.includes("tourist")
          ? "tourist"
          : null;

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: primaryRole,
      roles,
      userMetadata: user.user_metadata,
      appMetadata: user.app_metadata
    };
  }

  /**
   * Retrieves the full unified profile for the authenticated user.
   */
  async getFullUserProfile(
    user: AuthenticatedUser,
    scopedClient: SupabaseClient<Database>
  ): Promise<FullUserProfileDto> {
    if (!user || !user.id) {
      throw new UnauthorizedError("Authenticated user context is required");
    }

    const [profile, touristProfile] = await Promise.all([
      this.userRepo.findProfileById(user.id, scopedClient).catch(() => null),
      this.userRepo.findTouristProfileByUserId(user.id, scopedClient).catch(() => null)
    ]);

    return {
      id: user.id,
      email: user.email,
      fullName: profile?.full_name || (user.userMetadata?.full_name as string) || null,
      phone: profile?.phone || user.phone || null,
      preferredLanguage: profile?.preferred_language || null,
      role: user.role || null,
      roles: user.roles,
      profile,
      touristProfile
    };
  }
}

export const authService = new AuthService();
