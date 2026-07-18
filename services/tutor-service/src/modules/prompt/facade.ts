import { PromptService, RenderPromptParams } from "./src/services/prompt.service";
import { PromptTemplate } from "@grahvani/tutor-database";

export class PromptFacade {
  constructor(private readonly service: PromptService) {}

  async renderPrompt(
    variables: RenderPromptParams,
  ): Promise<{ rendered: string; version: string }> {
    return this.service.renderPrompt(variables);
  }

  async renderSummarizationPrompt(variables: {
    conversationHistory: string;
  }): Promise<{ rendered: string; version: string }> {
    return this.service.renderSummarizationPrompt(variables);
  }

  async createTemplate(name: string, version: string, template: string, isActive = false): Promise<PromptTemplate> {
    return this.service.createTemplate(name, version, template, isActive);
  }

  async listTemplates(name?: string): Promise<PromptTemplate[]> {
    return this.service.listTemplates(name);
  }

  async activateTemplate(name: string, version: string): Promise<PromptTemplate> {
    return this.service.activateTemplate(name, version);
  }
}

