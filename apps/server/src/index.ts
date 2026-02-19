import { env } from "./config/env";
import { logger } from "./lib/logger";
import { createServer } from "./ws/server";

const server = createServer(env.PORT);

const shutdown = () => {
  logger.info("Shutting down server...");
  server.close(() => {
    logger.info("Shutdown complete");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
