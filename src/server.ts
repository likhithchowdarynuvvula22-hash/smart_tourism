import { createApp } from "./app";
import { env } from "./config";
import { logger } from "./lib/logger";

const app = createApp();

let server: ReturnType<typeof app.listen> | null = null;

if (env.NODE_ENV !== "test") {
  server = app.listen(env.PORT, () => {
    logger.info(
      `🚀 SIH Smart Tourism Backend started successfully on port ${env.PORT} [${env.NODE_ENV}]`
    );
    logger.info(`👉 Health check available at: http://localhost:${env.PORT}/health`);
  });
}

let isShuttingDown = false;

export const gracefulShutdown = (signal: string, callback?: (err?: Error) => void) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  if (!server) {
    if (callback) callback();
    return;
  }

  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during server close");
      if (callback) callback(err);
      else process.exit(1);
      return;
    }
    logger.info("HTTP server closed successfully.");
    if (callback) callback();
    else process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forced shutdown due to timeout.");
    if (callback) callback(new Error("Shutdown timeout"));
    else process.exit(1);
  }, 10000).unref();
};

if (env.NODE_ENV !== "test") {
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught Exception occurred");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled Rejection occurred");
    process.exit(1);
  });
}

export default server;
