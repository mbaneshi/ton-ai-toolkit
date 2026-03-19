import { Bot, session, GrammyError, HttpError } from "grammy";
import { MyContext, SessionData, initialSessionData } from "./context";
import setupCommand from "./commands/setup";
import proposeCommand from "./commands/propose";
import voteHandler from "./commands/vote";
import balanceCommand from "./commands/balance";
import proposalsCommand from "./commands/proposals";
import historyCommand from "./commands/history";
import apikeyCommand from "./commands/apikey";
import naturalHandler from "./handlers/natural";

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN environment variable is not set");
}

export const bot = new Bot<MyContext>(token);

// Install session middleware (in-memory)
bot.use(
  session({
    initial: initialSessionData,
  })
);

// Register command handlers
bot.use(setupCommand);
bot.use(proposeCommand);
bot.use(voteHandler);
bot.use(balanceCommand);
bot.use(proposalsCommand);
bot.use(historyCommand);
bot.use(apikeyCommand);

// Help command
bot.command("help", async (ctx) => {
  await ctx.reply(
    `TON Multisig DAO Bot\n\n` +
      `Commands:\n` +
      `/setup - Initialize this group for DAO management\n` +
      `/setup_multisig <address> - Set the multisig wallet address\n` +
      `/setup_threshold <n> - Set approval threshold\n` +
      `/register - Register yourself as a signer\n` +
      `/setkey <hex_key> - Set your ed25519 public key\n` +
      `/propose <text> - Create a new proposal\n` +
      `/proposals - List pending proposals\n` +
      `/history - View past proposals\n` +
      `/balance - Check multisig wallet balance\n` +
      `/apikey - Generate API key for agent integrations (admin only)\n` +
      `/help - Show this help message\n\n` +
      `You can also type proposals in natural language and I'll detect them automatically.`
  );
});

bot.command("start", async (ctx) => {
  if (ctx.chat?.type === "private") {
    await ctx.reply(
      `Welcome to TON Multisig DAO Bot!\n\n` +
        `Add me to a group chat to get started.\n` +
        `Then use /setup to initialize the group for DAO management.\n\n` +
        `Use /help for a list of commands.`
    );
  } else {
    await ctx.reply(
      `TON Multisig DAO Bot is active.\n` +
        `Use /setup to initialize this group, or /help for commands.`
    );
  }
});

// Register natural language handler last (so commands take priority)
bot.use(naturalHandler);

// Error handler
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);

  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});
