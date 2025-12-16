import { prisma } from "../lib/db.js";

export class ChatService {
  /**
   * Create a new conversation
   * @param {string} userId
   * @param {string} mode
   * @param {string} title
   */
  async createConversation(userId: string, mode = "chat", title = null) {
    return prisma.conversation.create({
      data: {
        userId,
        mode,
        title: title || `New ${mode} conversation`,
      },
    });
  }

  /**
   * get or Create a new conversation
   * @param {string} userId
   * @param {string} mode
   * @param {string} title
   */
  async getOrCreateConversation(
    userId: string,
    conversationId = null,
    mode = "chat"
  ) {
    if (conversationId) {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      if (conversation) return conversation;
    }

    //Create new conversation if not found or not provider
    return await this.createConversation(userId, mode);
  }

  /**
   * Add a message to conversation
   * @param {string} conversationId
   * @param {string} role
   * @param {string|object} content
   */
  async addMessage(
    conversationId: string,
    role: string,
    content: string | Object
  ) {
    const contentStr =
      typeof content === "string" ? content : JSON.stringify(content);

    return await prisma.message.create({
      data: {
        conversationId,
        role,
        content: contentStr,
      },
    });
  }

  /**
   * Get conversation Messages
   * @param {string} conversationId
   */
  async getMessages(conversationId: string) {
    return await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Get all conversations of the user
   * @param {string} userId
   */
  async getUserConversation(userId: string) {
    return await prisma.conversation.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        messages: {
          take: 1,
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });
  }

  /**
   * Delete a conversation
   * @param {string} conversationId
   * @param {string} userId
   */
  async deleteConversation(conversationId: string, userId: string) {
    return await prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        userId,
      },
    });
  }

  /**
   * Update conversation title
   * @param {string} conversationId
   * @param {string} title
   */
  async UpdateTitle(conversationId: string, title: string) {
    return await prisma.conversation.update({
      where: {
        id: conversationId,
      },
      data: { title },
    });
  }

  /**
   * Helper to parse content (JSON or string)
   */
  async parseContent(content: any) {
    try {
      return JSON.parse(content);
    } catch (error) {
      return content;
    }
  }

  /**
   * Format messages for AI SDK
   * @param {Array} messages
   */
  formatMessagesForAI(messages: Array<any>) {
    return messages.map((msg) => {
      const role = msg.role === "model" ? "assistant" : msg.role;

      const contentString =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);

      return {
        role: role as "user" | "assistant",
        parts: [
          {
            type: "text" as const  , 
            text: contentString,
          },
        ],
      };
    });
  }
}
