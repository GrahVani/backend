import { PrismaClient } from "@prisma/client";
import { config } from "./index";
import { logger } from "./logger";

const prisma = new PrismaClient({
  datasources: {
    db: { url: config.database.url },
  },
});

prisma.$connect()
  .then(() => logger.info("Connected to database"))
  .catch((err) => logger.error({ err }, "Database connection failed"));

export { prisma };
