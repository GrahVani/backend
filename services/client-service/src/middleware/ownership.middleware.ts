import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";
import { clientRepository } from "../repositories/client.repository";
import { ClientNotFoundError, UnauthorizedAccessError } from "../errors/client.errors";

/**
 * Express param middleware that automatically verifies that the client (identified by :id)
 * exists and is owned by the requesting user.
 * Blocks all unauthorized access to sub-resources (charts, dasha, family, history, etc.)
 */
export const requireClientOwnership = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
  id: string,
) => {
  try {
    if (!req.user || !req.user.tenantId || !req.user.id) {
      return next(new UnauthorizedAccessError());
    }

    // findById now takes userId to enforce ownership scoping
    const client = await clientRepository.findById(req.user.tenantId, id, req.user.id);

    if (!client) {
      // Throw 404 so that attackers can't even know if another user's client ID exists
      return next(new ClientNotFoundError(id));
    }

    // Attach client to request for convenience in downstream controllers
    (req as any).client = client;

    next();
  } catch (error) {
    next(error);
  }
};
