import rateLimit from "express-rate-limit";

/**
 * Strict rate limiter for AI generation endpoints.
 * Limits users to 10 requests per minute to prevent API exhaustion.
 */
export const strictAiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per `window` (here, per 1 minute)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    message: "Too many AI generation requests from this IP, please try again after a minute.",
    code: "RATE_LIMITED",
  },
});
