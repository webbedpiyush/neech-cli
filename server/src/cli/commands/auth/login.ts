import { cancel, confirm, intro, isCancel, outro } from "@clack/prompts";
import { logger } from "better-auth";
import { AuthClient, createAuthClient } from "better-auth/client";
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
import { prisma } from "../../../lib/db.js";
import {
  clearStoredToken,
  getStoredToken,
  isTokenExpired,
  requireAuth,
  storeToken,
} from "../../../lib/token.js";

dotenv.config();

const URL = "http://localhost:3005";
const CLIENT_ID = process.env.GITHUB_CLIENT_ID as string;
export const CONFIG_DIR = path.join(os.homedir(), "better-auth");
export const TOKEN_FILE = path.join(CONFIG_DIR, "token.json");

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
  const existingToken = await getStoredToken();
  const expired = await isTokenExpired();

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
      verification_uri_complete,
      verification_uri,
      interval = 5,
      expires_in,
    } = data;

    console.log(chalk.cyan("Device Authorization Required"));

    console.log(
      `Please visit ${chalk.cyan.underline(verification_uri_complete)}`
    );

    console.log(`Enter Code: ${chalk.green(user_code)}`);

    const shouldOpen = await confirm({
      message: "Open browser automatically?",
      initialValue: true,
    });

    if (!isCancel(shouldOpen) && shouldOpen) {
      const urlToOpen = verification_uri_complete;
      await open(urlToOpen);
    }

    console.log(
      chalk.gray(
        `Waiting for authorization (expires in ${Math.floor(
          expires_in / 60
        )} minutes)...`
      )
    );

    const token = await pollForToken(
      authClient,
      device_code,
      clientId,
      interval
    );

    if (token) {
      const saved = await storeToken(token);

      if (!saved) {
        console.log(
          chalk.yellow("\n⚠️ Warning: Could not save authentication token.")
        );
        console.log(chalk.yellow("You may need to login again on next use."));
      }
    }

    // TODO : get the user data
    outro(chalk.green("Login Successful!"));

    console.log(chalk.green(`\n Token saved to : ${TOKEN_FILE}`));

    console.log(
      chalk.gray("You can now use AI commands without logging in again.\n")
    );
  } catch (err: any) {
    spinner.stop();
    console.error(chalk.red("❌ Login failed:", err.message));
    process.exit(1);
  }
}

async function pollForToken(
  authClient: any,
  deviceCode: string,
  clientId: string,
  initialInterval: number
) {
  let pollingInterval = initialInterval;
  const spinner = yoctoSpinner({ text: "", color: "cyan" });
  let dots = 0;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      dots = (dots + 1) % 4;
      spinner.text = chalk.gray(
        `Polling for authorization${" ".repeat(3 - dots)}`
      );
      if (!spinner.isSpinning) spinner.start();

      try {
        const { data, error } = await authClient.device.token({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: clientId,
        });

        if (data?.access_token) {
          console.log(
            chalk.bold.yellow(`Your access token : ${data.access_token}`)
          );

          spinner.stop();
          resolve(data);
          return;
        } else if (error as any) {
          switch (error.error) {
            case "authorization_pending":
              // Continue polling silently
              break;
            case "slow_down":
              pollingInterval += 5;
              console.log(`⚠️  Slowing down polling to ${pollingInterval}s`);
              break;
            case "access_denied":
              console.error("❌ Access was denied by the user");
              process.exit(1);
              break;
            case "expired_token":
              console.error(
                "❌ The device code has expired. Please try again."
              );
              process.exit(1);
              break;
            default:
              spinner.stop();
              logger.error("❌ Error:", error.error_description);
              process.exit(1);
          }
        }
      } catch (error: any) {
        spinner.stop();
        logger.error("Network Error:", error.message);
        process.exit(1);
      }

      setTimeout(poll, pollingInterval * 1000);
    };
    setTimeout(poll, pollingInterval * 1000);
  });
}

async function logoutAction() {
  intro(chalk.bold("👋 Logout"));

  const token = await getStoredToken();

  if (!token) {
    console.log(chalk.yellow("You're not logged in."));
    process.exit(0);
  }

  const shouldLogout = await confirm({
    message: "Are you sure you want to logout?",
    initialValue: false,
  });

  if (isCancel(shouldLogout) || !shouldLogout) {
    cancel("Logout cancelled");
    process.exit(0);
  }

  const cleared = await clearStoredToken();

  if (cleared) {
    outro(chalk.green("✅ Successfully logged out!"));
  } else {
    console.log(chalk.yellow("⚠️ Could not clear token file."));
  }
}

async function whoamiAction() {
  const token = await requireAuth();

  if (!token?.access_token) {
    console.log("No access token found. Please login.");
    process.exit(1);
  }

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

  console.log(
    chalk.bold.greenBright(`\n👤 User: ${user?.name}
📧 Email: ${user?.email}
👤 ID: ${user?.id}`)
  );
}

// ------------------------------------------------------------
// COMMANDER-SETUP
// ------------------------------------------------------------

export const login = new Command("login")
  .description("Login to your Neech account")
  .option("--server-url <url>", "The Neech Server URL", URL)
  .option("--client-id <id>", "The Client ID", CLIENT_ID)
  .action(loginAction);

export const whoami = new Command("whoami")
  .description("Show current authenticated user")
  .option("--server-url <url>", "The Neech server url", URL)
  .action(whoamiAction);

export const logout = new Command("logout")
  .description("Logout and clear stored credentials")
  .action(logoutAction);
