import { google } from "@ai-sdk/google";
import { config } from "../../config/google.config.js";
import { streamText } from "ai";
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
    tools = undefined,
    onToolCall = null
  ) {
    try {
      const streamConfig = {
        model: this.model,
        messages: messages,
      };

      const result = streamText(streamConfig);

      let fullResponse = "";

      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        if (onChunk) {
          onChunk(chunk);
        }
      }

      const fullResult = result;

      return {
        content: fullResponse,
        finishResponse: fullResult.finishReason,
        usage: fullResult.usage,
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
  async getMessage(messages: Array<any>, tool = undefined) {
    let fullResponse = "";
    await this.sendMessage(messages, (chunk: string) => {
      fullResponse += chunk;
    });
    return fullResponse;
  }
}
