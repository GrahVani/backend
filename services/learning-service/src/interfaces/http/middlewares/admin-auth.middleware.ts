import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../../config";
import { logger } from "../../../config/logger";

export interface AdminUser {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
}

export interface AdminRequest extends Request {
  adminUser?: AdminUser;
}

export function adminAuthMiddleware(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" },
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.jwt.secret) as {
      sub?: string;
      userId?: string;
      email: string;
      role: string;
      tenantId?: string;
    };

    const userId = decoded.sub || decoded.userId;
    if (!userId) {
      logger.warn("Admin JWT missing user identifier (sub/userId)");
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid token structure" },
      });
      return;
    }

    if (decoded.role !== "admin" && decoded.role !== "moderator") {
      logger.warn({ userId, role: decoded.role }, "Unauthorized role attempted admin access");
      res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Administrative access required" },
      });
      return;
    }

    req.adminUser = {
      userId,
      email: decoded.email,
      role: decoded.role,
      tenantId: decoded.tenantId,
    };

    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      res.status(401).json({
        success: false,
        error: { code: "TOKEN_EXPIRED", message: "Access token has expired" },
      });
      return;
    }
    if (error.name === "JsonWebTokenError") {
      res.status(401).json({
        success: false,
        error: { code: "INVALID_TOKEN", message: "Invalid access token" },
      });
      return;
    }
    logger.error({ error }, "Admin auth middleware error");
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Authentication failed" },
    });
  }
}
