/**
 * Prompt module — internal implementation module.
 *
 * This module owns prompt template storage and rendering.
 * It is invoked in-process by the Tutor Orchestrator; it does not expose HTTP.
 */

export { PromptFacade } from "./facade";

export { PromptService, RenderPromptParams } from "./src/services/prompt.service";
