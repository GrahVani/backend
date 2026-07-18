import { logger } from "../config/logger";

export enum CircuitBreakerState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastStateChange: number = Date.now();

  constructor(private readonly config: CircuitBreakerConfig) {}

  getState(): CircuitBreakerState {
    this.checkCooldown();
    return this.state;
  }

  private checkCooldown() {
    if (this.state === CircuitBreakerState.OPEN) {
      const elapsed = Date.now() - this.lastStateChange;
      if (elapsed >= this.config.cooldownMs) {
        this.transitionTo(CircuitBreakerState.HALF_OPEN);
      }
    }
  }

  private transitionTo(newState: CircuitBreakerState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();
    logger.warn({ oldState, newState }, `[CircuitBreaker] State transitioned`);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkCooldown();

    if (this.state === CircuitBreakerState.OPEN) {
      logger.error("[CircuitBreaker] Request rejected. Breaker is OPEN");
      throw new Error("CIRCUIT_BREAKER_OPEN");
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  private onSuccess() {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      logger.info("[CircuitBreaker] Half-open request succeeded. Closing breaker.");
      this.transitionTo(CircuitBreakerState.CLOSED);
    }
    this.failureCount = 0;
  }

  private onFailure(err: any) {
    this.failureCount++;
    logger.warn(
      { failureCount: this.failureCount, error: err.message || err },
      "[CircuitBreaker] Execution failed",
    );

    if (this.state === CircuitBreakerState.CLOSED) {
      if (this.failureCount >= this.config.failureThreshold) {
        logger.error(`[CircuitBreaker] Consecutive failures exceeded threshold. Opening breaker.`);
        this.transitionTo(CircuitBreakerState.OPEN);
      }
    } else if (this.state === CircuitBreakerState.HALF_OPEN) {
      logger.error("[CircuitBreaker] Half-open execution failed. Opening breaker.");
      this.transitionTo(CircuitBreakerState.OPEN);
    }
  }
}
