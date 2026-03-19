import { Composer } from "grammy";
import crypto from "node:crypto";
import { MyContext } from "../context";
import { db } from "../../db";
import { groups } from "../../db/schema";
import { eq } from "drizzle-orm";

const composer = new Composer<MyContext>();

composer.command("apikey", async (ctx) => {
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    await ctx.reply("This command only works in group chats.");
    return;
  }

  const chatId = ctx.chat.id.toString();
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  // Verify user is an admin of the group
  try {
    const chatMember = await ctx.api.getChatMember(ctx.chat.id, userId);
    if (chatMember.status !== "administrator" && chatMember.status !== "creator") {
      await ctx.reply("Only group administrators can generate API keys.");
      return;
    }
  } catch {
    await ctx.reply("Could not verify admin status. Please try again.");
    return;
  }

  // Check group exists
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, chatId),
  });

  if (!group) {
    await ctx.reply("Group not set up yet. Run /setup first.");
    return;
  }

  // Generate a new API key
  const apiKey = crypto.randomBytes(32).toString("hex");

  await db
    .update(groups)
    .set({ apiKey })
    .where(eq(groups.id, chatId));

  // Send the key via private message to the admin, and confirm in group
  try {
    await ctx.api.sendMessage(
      userId,
      `API key for group "${group.title || chatId}":\n\n` +
        `\`${apiKey}\`\n\n` +
        `Use this key in the \`auth_token\` field when calling the agent API.\n` +
        `Keep this secret! Anyone with this key can submit proposals to your group.\n\n` +
        `Endpoint: POST /agent/propose`,
      { parse_mode: "Markdown" }
    );
    await ctx.reply(
      "A new API key has been generated and sent to you via DM. " +
        "If you didn't receive it, start a private chat with me first and try again."
    );
  } catch {
    // If DM fails, show it in group with a warning (ephemeral not available in grammy easily)
    await ctx.reply(
      "Could not send you a DM. Please start a private chat with me first, then run /apikey again.\n\n" +
        "For security, the API key is only sent via private message."
    );
  }
});

export default composer;
