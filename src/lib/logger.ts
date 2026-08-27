import pino from "pino";
import { env } from "../config";

export const logger = pino({
  level: env.LOG_LEVEL || (env.NODE_ENV === "production" ? "info" : "debug"),
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
            ignore: "pid,hostname"
          }
        }
      : undefined,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "headers.authorization",
      "headers.cookie",
      "authorization",
      "password",
      "token",
      "secret",
      "service_role_key",
      "apiKey",
      "api_key",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GEMINI_API_KEY",
      "jwt",
      "body.password",
      "body.token",
      "body.email",
      "body.phone",
      "body.accessToken",
      "body.refreshToken",
      "email",
      "phone",
      "user.email",
      "user.phone",
      "user_metadata.email",
      "user_metadata.phone"
    ],
    remove: true
  }
});
