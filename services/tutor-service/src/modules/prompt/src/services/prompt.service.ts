import Handlebars from "handlebars";
import { PrismaClient, PromptTemplate } from "@grahvani/tutor-database";
import { logger } from "../../../../config/logger";


export interface RenderPromptParams {
  content: string;
  lessonContext?: string;
  conversationHistory?: string;
}

export class PromptService {
  private systemPromptTemplate: Handlebars.TemplateDelegate;
  private summarizationPromptTemplate: Handlebars.TemplateDelegate;

  constructor(private readonly prisma?: PrismaClient) {
    const templateStr = `You are Gyaneshwara, a wise, compassionate, and expert AI tutor on the Grahvani Learning Platform.
Your purpose is to help the learner understand the concepts of Jyotiṣa (Vedic Astrology) as a Vedāṅga.

Keep your responses grounded in the provided lesson context. Do not invent details or refer to external concepts not covered in the lesson context unless specifically asked to explain fundamental terms.
Use clear, encouraging, and clear language. Speak with the authority and humility of a traditional guru.
Keep explanations concise, crisp, and pedagogical (typically 2-4 focused paragraphs unless asked for an in-depth breakdown). Avoid repetitive introductory or concluding filler.

<interactive_explanation_policy>
When asked about an interactive/visual:
1. Pre-computation: Infer the learner's actual confusion. Explain ONLY what removes that confusion. Do not summarize the entire lesson. Teach from their current understanding.
2. Knowledge Sources: Use the 'Interactive Specification' exclusively for explaining visuals, interactions, and pedagogical intent. Use the 'Lesson Context' exclusively for explaining concepts, theory, and learning objectives.
3. Visuals First: ALWAYS explain the VISUAL before the theory ("What am I looking at?"). Walk through every major visible element (What is it? What does it represent?).
4. Interactions: Explain what to click, what changes, and what to observe.
5. Comparisons: Explain each system independently before comparing them.
6. Pedagogy: Teach progressively (Observation -> Visual Meaning -> Concept -> Lesson Objective -> Key Takeaway). Avoid unexplained jargon.
7. Reinforcement: Conclude with the key takeaway, one common misconception to avoid, and a suggestion for what to explore next.
</interactive_explanation_policy>

Current Lesson Context:
"""
{{lessonContext}}
"""

Conversation History:
"""
{{conversationHistory}}
"""

User query: {{content}}`;

    this.systemPromptTemplate = Handlebars.compile(templateStr);

    const summarizationTemplateStr = `You are Gyaneshwara. Summarize the following conversation log between a Jyotiṣa (Vedic Astrology) learner and you.
Keep the summary concise and focused on the key concepts studied, questions asked, and guidance provided.
Do not use markdown wrappers, code format blocks, or lists; output a single, dense paragraph.

Conversation Log:
"""
{{conversationHistory}}
"""

Summary:`;
    this.summarizationPromptTemplate = Handlebars.compile(summarizationTemplateStr);
  }

  async renderPrompt(
    variables: RenderPromptParams,
  ): Promise<{ rendered: string; version: string }> {
    if (this.prisma) {
      try {
        const activeTemplate = await this.prisma.promptTemplate.findFirst({
          where: { name: "gyaneshwara", isActive: true },
          orderBy: { createdAt: "desc" },
        });
        if (activeTemplate) {
          const compiled = Handlebars.compile(activeTemplate.template);
          const rendered = compiled({
            lessonContext: variables.lessonContext || "No context provided.",
            conversationHistory: variables.conversationHistory || "No previous messages.",
            content: variables.content,
          });
          return { rendered, version: `${activeTemplate.name}:${activeTemplate.version}` };
        }
      } catch (err: any) {
        logger.warn({ error: err.message }, "Failed to fetch dynamic gyaneshwara prompt from database, using fallback");
      }
    }

    const rendered = this.systemPromptTemplate({
      lessonContext: variables.lessonContext || "No context provided.",
      conversationHistory: variables.conversationHistory || "No previous messages.",
      content: variables.content,
    });

    return {
      rendered,
      version: "gyaneshwara:1.0.0",
    };
  }

  async renderSummarizationPrompt(variables: {
    conversationHistory: string;
  }): Promise<{ rendered: string; version: string }> {
    if (this.prisma) {
      try {
        const activeTemplate = await this.prisma.promptTemplate.findFirst({
          where: { name: "summarizer", isActive: true },
          orderBy: { createdAt: "desc" },
        });
        if (activeTemplate) {
          const compiled = Handlebars.compile(activeTemplate.template);
          const rendered = compiled({
            conversationHistory: variables.conversationHistory,
          });
          return { rendered, version: `${activeTemplate.name}:${activeTemplate.version}` };
        }
      } catch (err: any) {
        logger.warn({ error: err.message }, "Failed to fetch dynamic summarizer prompt from database, using fallback");
      }
    }

    const rendered = this.summarizationPromptTemplate({
      conversationHistory: variables.conversationHistory,
    });

    return {
      rendered,
      version: "summarizer:1.0.0",
    };
  }

  async createTemplate(name: string, version: string, template: string, isActive = false): Promise<PromptTemplate> {
    if (!this.prisma) throw new Error("Prisma client not configured on PromptService");
    if (isActive) {
      await this.prisma.promptTemplate.updateMany({
        where: { name },
        data: { isActive: false },
      });
    }
    return this.prisma.promptTemplate.upsert({
      where: { name_version: { name, version } },
      create: { name, version, template, isActive },
      update: { template, isActive },
    });
  }

  async listTemplates(name?: string): Promise<PromptTemplate[]> {
    if (!this.prisma) return [];
    return this.prisma.promptTemplate.findMany({
      where: name ? { name } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  async activateTemplate(name: string, version: string): Promise<PromptTemplate> {
    if (!this.prisma) throw new Error("Prisma client not configured on PromptService");
    await this.prisma.promptTemplate.updateMany({
      where: { name },
      data: { isActive: false },
    });
    return this.prisma.promptTemplate.update({
      where: { name_version: { name, version } },
      data: { isActive: true },
    });
  }
}

