import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  CORS_ORIGIN: z.string().default("*"),
  FRONTEND_ORIGINS: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  // AI Configuration (Phase 6)
  GEMINI_API_KEY: z.string().optional(),
  AI_MODEL_NAME: z.string().default("gemini-1.5-flash"),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().default(2048)
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables configuration:", parsedEnv.error.format());
  throw new Error("Invalid environment configuration. Please check your .env file.");
}

export const env = parsedEnv.data;
export type EnvConfig = z.infer<typeof envSchema>;
