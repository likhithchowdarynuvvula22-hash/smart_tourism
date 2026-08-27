import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config";
import { Database } from "../types/database.types";
import { logger } from "./logger";
import { InternalServerError } from "../utils/appError";

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  logger.error(
    "Missing required Supabase environment variables (SUPABASE_URL or SUPABASE_ANON_KEY)"
  );
  throw new Error("Supabase configuration is missing. Check SUPABASE_URL and SUPABASE_ANON_KEY.");
}

/**
 * Public Anonymous Supabase Client singleton.
 * Enforces database Row Level Security (RLS) policies.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

/**
 * Factory for Server-Only Service Role Admin Client.
 * WARNING: Bypasses RLS. Use ONLY for internal administrative or background tasks.
 */
export const getAdminClient = (): SupabaseClient<Database> => {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new InternalServerError("Supabase Service Role Key is not configured on this server");
  }

  return createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};

export interface DatabaseConnectionCheck {
  status: "connected" | "error";
  verifiedTable: string;
  recordCount: number;
  latencyMs: number;
  error?: string;
}

/**
 * Non-destructive probe to verify database connectivity.
 * Executes a fast COUNT query on the public `destinations` table without modifying data.
 */
export const checkDatabaseConnection = async (): Promise<DatabaseConnectionCheck> => {
  const start = Date.now();
  try {
    const { count, error } = await supabase
      .from("destinations")
      .select("*", { count: "exact", head: true });

    const latencyMs = Date.now() - start;

    if (error) {
      logger.error({ error }, "Database connectivity probe failed via PostgREST error");
      return {
        status: "error",
        verifiedTable: "destinations",
        recordCount: 0,
        latencyMs,
        error: "Failed to communicate with Supabase database"
      };
    }

    return {
      status: "connected",
      verifiedTable: "destinations",
      recordCount: count ?? 0,
      latencyMs
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : "Unknown database connection error";
    logger.error({ err }, "Database connectivity probe threw exception");
    return {
      status: "error",
      verifiedTable: "destinations",
      recordCount: 0,
      latencyMs,
      error: message
    };
  }
};
