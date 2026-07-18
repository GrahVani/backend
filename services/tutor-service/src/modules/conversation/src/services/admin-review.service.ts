import { ConversationRepository } from "../repositories/conversation.repository";
import { NotFoundError } from "@grahvani/contracts";
import { logger } from "../../../../config/logger";

export class AdminReviewService {
  constructor(private readonly repository: ConversationRepository) {}

  async flagMessage(messageId: string, reason: string, flaggedBy: string) {
    try {
      const flag = await this.repository.createMessageFlag(messageId, reason, flaggedBy);
      logger.info({ messageId, reason, flaggedBy }, "Admin flagged tutor message");
      return flag;
    } catch (err) {
      logger.error({ err, messageId }, "Failed to flag message in AdminReviewService");
      throw err;
    }
  }

  async listFlaggedMessages(limit = 50) {
    // Return messages along with flags using prisma directly from repository or custom query
    return this.repository.listFlaggedMessages(limit);
  }

  async resolveMessageFlag(flagId: string) {
    try {
      const result = await this.repository.resolveMessageFlag(flagId);
      logger.info({ flagId }, "Admin resolved/dismissed tutor message flag");
      return result;
    } catch (err) {
      logger.error({ err, flagId }, "Failed to resolve message flag in AdminReviewService");
      throw err;
    }
  }
}

