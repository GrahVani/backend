import type { Server } from "http";
import { logger } from "../config/logger";

export type ShutdownHandler = () => Promise<void> | void;

export interface ShutdownManagerOptions {
  server: Server;
  handlers?: ShutdownHandler[];
  serverCloseTimeoutMs?: number;
  handlerTimeoutMs?: number;
  forceExitTimeoutMs?: number;
}

/**
 * Creates a graceful shutdown manager.
 *
 * Sequence:
 * 1. Stop accepting new HTTP connections.
 * 2. Wait up to `serverCloseTimeoutMs` for existing connections to drain.
 * 3. Run registered shutdown handlers (workers, queues, DB, Redis) with `handlerTimeoutMs` each.
 * 4. Force exit after `forceExitTimeoutMs` if shutdown has not completed.
 */
export function createShutdownManager(options: ShutdownManagerOptions) {
  const handlers = options.handlers ?? [];
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      logger.warn({ signal }, "Shutdown already in progress");
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "Tutor service shutdown initiated");

    const forceExitTimeout = setTimeout(() => {
      logger.error("Shutdown force exit triggered");
      process.exit(1);
    }, options.forceExitTimeoutMs ?? 60_000);

    try {
      await closeServer(options.server, options.serverCloseTimeoutMs ?? 25_000);
      logger.info("HTTP server closed; running shutdown handlers");

      for (const handler of handlers) {
        await runWithTimeout(handler, options.handlerTimeoutMs ?? 25_000);
      }

      logger.info("All shutdown handlers completed");
    } catch (err) {
      logger.error({ err }, "Error during shutdown sequence");
    } finally {
      clearTimeout(forceExitTimeout);
      logger.info("Tutor service shutdown complete");
      process.exit(0);
    }
  }

  function register(handler: ShutdownHandler): void {
    handlers.push(handler);
  }

  return { shutdown, register };
}

function closeServer(server: Server, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      logger.warn({ timeoutMs }, "HTTP server close timeout exceeded");
      resolve();
    }, timeoutMs);

    server.close((err) => {
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function runWithTimeout(handler: ShutdownHandler, timeoutMs: number): Promise<void> {
  const timer = setTimeout(() => {
    logger.warn({ timeoutMs }, "Shutdown handler timeout exceeded");
  }, timeoutMs);

  try {
    await Promise.resolve(handler());
  } catch (err) {
    logger.error({ err }, "Shutdown handler failed");
  } finally {
    clearTimeout(timer);
  }
}
