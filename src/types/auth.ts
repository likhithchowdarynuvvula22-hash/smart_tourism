import { SupabaseClient } from "@supabase/supabase-js";
import { Database, UserProfileRow, TouristProfileRow } from "./database.types";

export type AppRole = "tourist" | "business" | "admin";

export interface AuthenticatedUser {
  id: string;
  email?: string;
  phone?: string;
  role?: AppRole | null;
  roles: AppRole[];
  userMetadata?: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
}

export interface FullUserProfileDto {
  id: string;
  email?: string;
  fullName?: string | null;
  phone?: string | null;
  preferredLanguage?: string | null;
  role: AppRole | null;
  roles: AppRole[];
  profile: UserProfileRow | null;
  touristProfile: TouristProfileRow | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      scopedSupabase?: SupabaseClient<Database>;
    }
  }
}
