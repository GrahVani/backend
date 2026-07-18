import { config } from "../config";
import { logger } from "../config/logger";

export interface PlatformSetting {
  key: string;
  value: unknown;
  category: string;
  description: string | null;
  isSecret: boolean;
  updatedAt: Date;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000;

const KNOWN_FLAGS = [
  "tutor.enabled",
  "tutor.streaming.enabled",
  "tutor.interactive-explanations.enabled",
  "tutor.recommendations.enabled",
  "tutor.admin-review.enabled",
] as const;

export type TutorFeatureFlag = (typeof KNOWN_FLAGS)[number];

/**
 * Feature-flag service that reads PlatformSetting values from admin-service.
 *
 * Values are cached in memory with a 60-second TTL to avoid hammering the
 * admin-service on every request. When admin-service is unreachable or returns
 * an error, the service falls back to the provided default.
 */
export class FeatureFlagService {
  private cache = new Map<string, CacheEntry<unknown>>();

  async getFlag<T>(key: string, defaultValue: T): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    const value = await this.fetchSetting(key, defaultValue);
    this.cache.set(key, { value, expiresAt: Date.now() + DEFAULT_TTL_MS });
    return value;
  }

  async isEnabled(key: TutorFeatureFlag, defaultValue = false): Promise<boolean> {
    const value = await this.getFlag(key, defaultValue);
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true";
    return defaultValue;
  }

  async isTutorEnabled(): Promise<boolean> {
    return this.isEnabled("tutor.enabled", false);
  }

  async isStreamingEnabled(): Promise<boolean> {
    return this.isEnabled("tutor.streaming.enabled", false);
  }

  async isInteractiveExplanationsEnabled(): Promise<boolean> {
    return this.isEnabled("tutor.interactive-explanations.enabled", false);
  }

  async isRecommendationsEnabled(): Promise<boolean> {
    return this.isEnabled("tutor.recommendations.enabled", false);
  }

  async isAdminReviewEnabled(): Promise<boolean> {
    return this.isEnabled("tutor.admin-review.enabled", false);
  }

  private async fetchSetting<T>(key: string, defaultValue: T): Promise<T> {
    const adminUrl = config.services.admin;
    const serviceKey = config.internalServiceKey;

    if (!adminUrl) {
      logger.warn({ key }, "ADMIN_SERVICE_URL not configured; using feature flag default");
      return defaultValue;
    }

    try {
      const response = await fetch(`${adminUrl}/internal/settings/${encodeURIComponent(key)}`, {
        headers: {
          "x-internal-key": serviceKey,
          "x-request-id": `tutor-flag-${Date.now()}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          logger.debug({ key }, "Feature flag not found in admin-service; using default");
          return defaultValue;
        }
        logger.warn({ key, status: response.status }, "Feature flag fetch failed; using default");
        return defaultValue;
      }

      const payload = (await response.json()) as { success: boolean; data?: PlatformSetting };
      if (!payload.success || !payload.data) {
        return defaultValue;
      }

      return payload.data.value as T;
    } catch (err) {
      logger.error({ err, key }, "Error fetching feature flag; using default");
      return defaultValue;
    }
  }
}

export const featureFlagService = new FeatureFlagService();
