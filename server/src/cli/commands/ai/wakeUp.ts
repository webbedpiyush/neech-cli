import chalk from "chalk";
import { getStoredToken } from "../../../lib/token.js";
import yoctoSpinner from "yocto-spinner";
import { prisma } from "../../../lib/db.js";
import { select } from "@clack/prompts";
import { Command } from "commander";
import { startChat } from "../../chat/chat-with-ai.js";

const wakeUpAction = async () => {
  const token = await getStoredToken();
  if (!token?.access_token) {
    console.log(chalk.red("Not authenticated , please Login"));
    return;
  }

  const spinner = yoctoSpinner({ text: "Fetching user information..." });
  spinner.start();

  const user = await prisma.user.findFirst({
    where: {
      sessions: {
        some: {
          token: token.access_token,
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
    },
  });

  spinner.stop();

  if (!user) {
    console.log(chalk.red("No user is found."));
    return;
  }

  console.log(chalk.green(`\n Welcome back, ${user.name}!\n`));

  const choice = await select({
    message: "Select an option:",
    options: [
      {
        value: "chat",
        label: "Chat",
        hint: "Simple chat with AI",
      },
      {
        value: "tool",
        label: "Tool Calling",
        hint: "Chat with tools ( Google Search, Code Execution )",
      },
      {
        value: "agent",
        label: "Agentic Mode",
        hint: "Advanced AI agent ( Coming soon )",
      },
    ],
  });

  switch (choice) {
    case "chat":
      await startChat();
      break;
    case "tool":
      console.log(chalk.green("tool calling is initialised"));
      break;
    case "agent":
      console.log(chalk.green("agentic chat is initialised"));
      break;
  }
};

export const wakeUp = new Command("wakeup")
  .description("Wake up the AI")
  .action(wakeUpAction);
