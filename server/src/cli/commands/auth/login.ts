import { cancel, confirm, intro, isCancel, outro } from "@clack/prompts";
import { logger } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

import chalk from "chalk";
import { Command } from "commander";
import fs from "node:fs/promises";
import open from "open";
import os from "node:os";
import path from "node:path";
import yoctoSpinner from "yocto-spinner";
import dotenv from "dotenv";
import * as z from "zod/v4";
import { prisma } from "../../../lib/db";

dotenv.config();

const URL = "http://localhost:3005";
const CLIENT_ID = process.env.GITHUB_CLIENT_ID as string;
const CONFIG_DIR = path.join(os.homedir(), "better-auth");
const TOKEN_FILE = path.join(CONFIG_DIR, "token.json");

export async function loginAction(opts: any) {
  const optionschema = z.object({
    serverUrl: z.string().optional(),
    clientId: z.string().optional(),
  });
  const options = optionschema.parse(opts);

  const serverUrl = options.serverUrl || URL;
  const clientId = options.clientId || CLIENT_ID;

  intro(chalk.bold("🔐Auth Cli Login"));

  // TODO: CHANGE THIS WITH TOKEN MANAGEMENT UTILS
  const existingToken = true;
  const expired = false;

  if (existingToken && !expired) {
    const shouldReAuth = await confirm({
      message: "You are already logged in. Do you want to re-authenticate?",
      initialValue: false,
    });

    if (isCancel(shouldReAuth) || !shouldReAuth) {
      cancel("Authentication cancelled");
      process.exit(0);
    }
  }
  const authClient = createAuthClient({
    baseURL: serverUrl,
    plugins: [deviceAuthorizationClient()],
  });

  const spinner = yoctoSpinner({ text: "Requesting device authorization..." });
  spinner.start();

  try {
    const { data, error } = await authClient.device.code({
      client_id: clientId,
      scope: "openid profile email",
    });
    spinner.stop();

    if (error || !data) {
      logger.error(
        `Failed to request device authorization: ${error?.error_description}`
      );
      process.exit(1);
    }

    const {
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      interval = 5,
      expires_in,
    } = data;

    console.log(chalk.cyan("Device Authorization Required"));

    console.log(
      `Please visit ${chalk.cyan.underline(
        verification_uri || verification_uri_complete
      )}`
    );

    console.log(`Enter Code: ${chalk.green(user_code)}`);

    const shouldOpen = await confirm({
      message: "Open browser automatically?",
      initialValue: true,
    });

    if (!isCancel(shouldOpen) && shouldOpen) {
      const urlToOpen = verification_uri || verification_uri_complete;
      await open(urlToOpen);
    }

    console.log(
      chalk.gray(
        `Waiting for authorization (expires in ${Math.floor(
          expires_in / 60
        )} minutes)...`
      )
    );
  } catch (err: any) {}
}

// ------------------------------------------------------------
// COMMANDER-SETUP
// ------------------------------------------------------------

export const login = new Command("login")
  .description("Login to your Neech account")
  .option("--server-url <url>", "The Neech Server URL", URL)
  .option("--client-id <id>", "The Client ID", CLIENT_ID)
  .action(loginAction);
