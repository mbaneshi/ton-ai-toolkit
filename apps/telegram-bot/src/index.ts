import "dotenv/config";
import { bot } from "./bot";
import { startApiServer } from "./api/server";

async function main() {
  console.log("Starting TON Multisig DAO Bot...");

  // Set bot commands for the menu
  await bot.api.setMyCommands([
    { command: "setup", description: "Initialize group for DAO management" },
    { command: "propose", description: "Create a new proposal" },
    { command: "proposals", description: "List pending proposals" },
    { command: "history", description: "View past proposals" },
    { command: "balance", description: "Check multisig wallet balance" },
    { command: "register", description: "Register as a signer" },
    { command: "apikey", description: "Generate API key for agent integrations" },
    { command: "help", description: "Show help message" },
  ]);

  // Start both the API server and the bot
  startApiServer(bot);

  // Start long polling
  bot.start({
    onStart: (botInfo) => {
      console.log(`Bot @${botInfo.username} is running!`);
    },
  });
}

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  bot.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((error) => {
  console.error("Failed to start bot:", error);
  process.exit(1);
});
