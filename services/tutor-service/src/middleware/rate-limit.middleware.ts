import rateLimit from "express-rate-limit";

/**
 * Global rate limiter for the tutor service.
 *
 * Uses the standard `RateLimit-*` response headers and disables the legacy
 * `X-RateLimit-*` headers so that the dedicated headers middleware can add them
 * in a single, predictable place.
 */
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 100 : 5000,
  skip: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "";
    return (
      process.env.NODE_ENV !== "production" &&
      (ip.includes("127.0.0.1") || ip.includes("::1") || ip.includes("localhost"))
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests, please try again later.",
    },
  },
});
