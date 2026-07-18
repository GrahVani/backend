import { PrismaClient } from "@grahvani/tutor-database";
import { logger } from "../config/logger";
import { softDeleteMiddleware } from "./soft-delete.middleware";

const globalForPrisma = globalThis as unknown as {
  tutorPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.tutorPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "error" },
            { emit: "stdout", level: "warn" },
          ]
        : [{ emit: "stdout", level: "error" }],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.tutorPrisma = prisma;
}

prisma.$use(softDeleteMiddleware);

prisma.$on("query" as never, (e: { query: string; duration: number }) => {
  logger.debug({ query: e.query, duration: e.duration }, "Prisma query");
});

export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info("Prisma client disconnected");
  } catch (err) {
    logger.error({ err }, "Failed to disconnect Prisma client");
    throw err;
  }
}
