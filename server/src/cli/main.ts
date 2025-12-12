#!/usr/bin/env node

import dotenv from "dotenv";
import chalk from "chalk";
import figlet from "figlet";

import { Command } from "commander";
import { login } from "./commands/auth/login.js";

dotenv.config();

async function main() {
  // display banner
  console.log(
    chalk.cyan(
      figlet.textSync("Neech CLI", {
        font: "Standard",
        horizontalLayout: "default",
      })
    )
  );

  console.log(chalk.red("A cli based AI Tool \n"));

  const program = new Command("neech");

  program
    .version("0.0.1")
    .description("Neech CLI - A Cli based Tool")
    .addCommand(login);

  program.action(() => program.help());

  program.parse();
}

main().catch((err) => {
  console.log(chalk.red("Error running neech cli:"), err);
  process.exit(1);
});
