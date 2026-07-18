/**
 * Conversation module — internal implementation module.
 *
 * This module owns session/message/feedback persistence in the app_tutor schema.
 * It is invoked in-process by the Tutor Orchestrator; it does not expose HTTP directly.
 */

export { ConversationFacade } from "./facade";

export { ConversationService, CreateMessageParams } from "./src/services/conversation.service";
export { AdminReviewService } from "./src/services/admin-review.service";

export {
  ConversationRepository,
  CreateMessageDbParams,
} from "./src/repositories/conversation.repository";
