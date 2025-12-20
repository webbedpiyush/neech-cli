import { google } from "@ai-sdk/google";
import { config } from "../../config/google.config.js";
import { generateObject, streamText } from "ai";
import chalk from "chalk";

type OnChunk = (chunk: string) => void;

export class AIService {
  private model;
  constructor() {
    if (!config.googleApiKey) {
      throw new Error("GOOGLE_API_KEY is not set in env");
    }

    this.model = google(config.neechModel);
  }

  /**
   * Send a message and get streaming responses
   * @param {Array} messages
   * @param {function} onChunk
   * @param {Object} tools
   * @param {function} onToolCall
   * @returns {Promise<Object>}
   */
  async sendMessage(
    messages: Array<any>,
    onChunk: OnChunk,
    tools: any = undefined,
    onToolCall: any = null
  ) {
    try {
      const streamConfig: any = {
        model: this.model,
        messages: messages,
      };

      if (tools && Object.keys(tools).length > 0) {
        streamConfig.tools = tools;
        streamConfig.maxSteps = 5; // Allow up to 5 tool call steps
      }

      console.log(
        chalk.gray(`[DEBUG] Tools enabled: ${Object.keys(tools).join(",")}`)
      );

      const result = streamText(streamConfig);

      let fullResponse = "";

      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        if (onChunk) {
          onChunk(chunk);
        }
      }

      const fullResult = result;

      const toolCalls = [];
      const toolResults = [];

      if (fullResult.steps && Array.isArray(fullResult.steps)) {
        for (const step of fullResult.steps) {
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const toolCall of step.toolCalls) {
              toolCalls.push(toolCall);

              if (onToolCall) {
                onToolCall(toolCall);
              }
            }
          }

          if (step.toolResults && step.toolResults.length > 0) {
            toolResults.push(...step.toolResults);
          }
        }
      }

      return {
        content: fullResponse,
        finishResponse: fullResult.finishReason,
        usage: fullResult.usage,
        toolCalls,
        toolResults,
        step: fullResult.steps,
      };
    } catch (error: any) {
      console.error(chalk.red("AI Service Error:"), error.message);
      throw error;
    }
  }

  /**
   * Get a non-streaming response
   * @param {Array} messages
   * @param {Object} tools
   * @returns {Promise<string>}
   */
  async getMessage(messages: Array<any>, tools = undefined) {
    let fullResponse = "";
    const result = await this.sendMessage(
      messages,
      (chunk: string) => {
        fullResponse += chunk;
      },
      tools
    );
    return result.content;
  }

  /**
   * Generate structured output using a Zod schema
   * @param {Object} schema - Zod schema
   * @param {string} prompt - Prompt for generation
   * @returns {Promise<Object>} Parsed object matching the schema
   */
  async generatedStructured(schema: any, prompt: string) {
    try {
      const result = await generateObject({
        model: this.model,
        schema: schema,
        prompt: prompt,
      });

      return result.object;
    } catch (error: any) {
      console.error(
        chalk.red("AI Structured Generation error:"),
        error.message
      );
      throw error;
    }
  }
}
