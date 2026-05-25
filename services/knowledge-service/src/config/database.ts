import { PrismaClient } from "../generated/prisma";
import { logger } from "./logger";

let prismaClient: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    const url = process.env.KNOWLEDGE_DATABASE_URL || process.env.DATABASE_URL;

    if (!url) {
      throw new Error("KNOWLEDGE_DATABASE_URL or DATABASE_URL must be configured");
    }

    prismaClient = new PrismaClient({
      datasources: {
        db: { url },
      },
      log:
        process.env.NODE_ENV === "production"
          ? ["error"]
          : ["query", "error", "warn"],
    });

    logger.info("Database client initialized for knowledge-service");
  }

  return prismaClient;
}

export async function disconnectDatabase(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
    logger.info("Database disconnected");
  }
}
