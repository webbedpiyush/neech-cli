import chalk from "chalk";
// @ts-ignore
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { AIService } from "../ai/google-service.js";
import { ChatService } from "../../service/chat.service.js";
import { getStoredToken } from "../../lib/token.js";
import yoctoSpinner from "yocto-spinner";
import { prisma } from "../../lib/db.js";
import boxen from "boxen";
import { intro, isCancel, outro, text } from "@clack/prompts";
import { convertToModelMessages } from "ai";

marked.use(
  markedTerminal({
    code: chalk.cyan,
    blockquote: chalk.gray.italic,
    heading: chalk.green.bold,
    firstHeading: chalk.magenta.underline.bold,
    hr: chalk.reset,
    listitem: chalk.reset,
    paragraph: chalk.reset,
    strong: chalk.bold,
    em: chalk.italic,
    codespan: chalk.yellow.bgBlack,
    del: chalk.dim.gray.strikethrough,
    link: chalk.blue.underline,
    href: chalk.blue.underline,
  })
);

const aiService = new AIService();
const chatService = new ChatService();

async function getUserFromToken() {
  const token = await getStoredToken();
  if (!token?.access_token) {
    throw new Error("Not Authenticated. Please run 'neech login' first.");
  }

  const spinner = yoctoSpinner({ text: "Authenticating..." }).start();

  const user: any = prisma.user.findFirst({
    where: {
      sessions: {
        some: {
          token: token.access_token,
        },
      },
    },
  });

  if (!user) {
    spinner.error("User not found.");
    throw new Error("User not found. Please login again.");
  }

  spinner.success(`Welcome back, ${user.name}`);
  return user;
}

async function initConversation(
  userId: string,
  conversationId = null,
  mode = "chat"
) {
  const spinner = yoctoSpinner({ text: "Loading conversation..." }).start();

  const conversation: any = await chatService.getOrCreateConversation(
    userId,
    conversationId,
    mode
  );

  spinner.success("Conversation loaded");

  const conversationInfo = boxen(
    `${chalk.bold("Conversation")}: ${conversation.title}\n${chalk.gray(
      "ID: " + conversation.id
    )}\n${chalk.gray("Mode: " + conversation.mode)}`,
    {
      padding: 1,
      margin: {
        top: 1,
        bottom: 1,
      },
      borderStyle: "round",
      borderColor: "cyan",
      title: "💬 Chat Session",
      titleAlignment: "center",
    }
  );

  console.log(conversationInfo);

  if (conversation.messages?.length > 0) {
    console.log(chalk.yellow("Previous messages:\n"));
    displayMessages(conversation.messages);
  }

  return conversation;
}

async function displayMessages(messages: any) {
  messages.forEach((msg: any) => {
    if (msg.role === "user") {
      const userBox = boxen(chalk.white(msg.content), {
        padding: 1,
        margin: {
          left: 2,
          bottom: 1,
        },
        borderColor: "blue",
        borderStyle: "round",
        title: "👤 You",
        titleAlignment: "left",
      });

      console.log(userBox);
    } else {
      const renderedContent = marked.parse(msg.content);
      const assistantBox = boxen(renderedContent.trim(), {
        padding: 1,
        margin: {
          left: 2,
          bottom: 1,
        },
        borderColor: "green",
        borderStyle: "round",
        title: "🤖 Assistant",
        titleAlignment: "left",
      });
      console.log(assistantBox);
    }
  });
}

async function saveMessage(conversationId: string, role: string, content: any) {
  return await chatService.addMessage(conversationId, role, content);
}

async function getAIResponse(conversationId: string) {
  const spinner = yoctoSpinner({
    text: "AI is thinking...",
    color: "cyan",
  }).start();

  const dbMessages = await chatService.getMessages(conversationId);
  const uiMessages = chatService.formatMessagesForAI(dbMessages);
  const aiMessages = convertToModelMessages(uiMessages);

  let fullResponse = "";
  let isFirstChunk = true;

  try {
    const result = await aiService.sendMessage(aiMessages, (chunk) => {
      if (isFirstChunk) {
        spinner.stop();
        console.log("\n");
        const header = chalk.green.bold("🤖 Assistant:");
        console.log(header);
        console.log(chalk.gray("-".repeat(60)));
        isFirstChunk = false;
      }
      fullResponse += chunk;
    });

    console.log("\n");
    const renderedMarkdown = marked.parse(fullResponse);
    console.log(renderedMarkdown);
    console.log(chalk.gray("-".repeat(60)));
    console.log("\n");

    return result.content;
  } catch (error) {
    spinner.error("Failed to get AI response");
    throw error;
  }
}

async function updateConversationTitle(
  conversationId: string,
  userInput: string,
  messageCount: number
) {
  if (messageCount === 1) {
    const title = userInput.slice(0, 50) + (userInput.length > 50 ? "..." : "");
    await chatService.UpdateTitle(conversationId, title);
  }
}

async function chatLoop(conversation: any) {
  const helpBox = boxen(
    `${chalk.gray("• Type your message and press Enter")}\n${chalk.gray(
      "• Markdown formatting is supported in responses"
    )}\n${chalk.gray("• Type 'exit' to end conversation")}\n${chalk.gray(
      "• Press Ctrl+c to quit anytime"
    )}`,
    {
      padding: 1,
      margin: {
        bottom: 1,
      },
      borderStyle: "round",
      borderColor: "gray",
      dimBorder: true,
    }
  );

  console.log(helpBox);

  while (true) {
    const userInput = await text({
      message: chalk.blue("Your message"),
      placeholder: "Type your message...",
      validate(value) {
        if (!value || value.trim().length === 0) {
          return "Message cannot be empty.";
        }
      },
    });

    if (isCancel(userInput)) {
      const exitBox = boxen(chalk.yellow("Chat session ended. Goodbye!"), {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "yellow",
      });
      console.log(exitBox);
      process.exit(0);
    }

    if (userInput.toLowerCase() === "exit") {
      const exitBox = boxen(chalk.yellow("Chat session ended. Goodbye!"), {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "yellow",
      });
      console.log(exitBox);
      break;
    }

    // save user message
    await saveMessage(conversation.id, "user", userInput);

    // get message count from db
    const messages = await chatService.getMessages(conversation.id);

    // get ai response with streaming & markdown rendering
    const aiResponse = await getAIResponse(conversation.id);

    // save AI response
    await saveMessage(conversation.id, "assistant", aiResponse);

    // update title
    await updateConversationTitle(conversation.id, userInput, messages.length);
  }
}

// main entry point
export async function startChat(mode = "chat", conversationId = null) {
  try {
    intro(
      boxen(chalk.bold.cyan("Neech AI Chat"), {
        padding: 1,
        borderStyle: "double",
        borderColor: "cyan",
      })
    );

    const user = await getUserFromToken();
    const conversation = await initConversation(user.id, conversationId, mode);
    await chatLoop(conversation);

    outro(chalk.green("Thanks for chatting!"));
  } catch (error: any) {
    const errorBox = boxen(chalk.red(`Error: ${error.message}`), {
      padding: 1,
      margin: 1,
      borderColor: "red",
      borderStyle: "round",
    });
    console.log(errorBox);
    process.exit(1);
  }
}
