import { Composer } from "grammy";
import { MyContext } from "../context";
import { db } from "../../db";
import { groups } from "../../db/schema";
import { eq } from "drizzle-orm";
import { getBalance, formatTON, getTonviewerUrl } from "../../services/ton";

const composer = new Composer<MyContext>();

composer.command("balance", async (ctx) => {
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    await ctx.reply("This command only works in group chats.");
    return;
  }

  const chatId = ctx.chat.id.toString();

  const group = await db.query.groups.findFirst({
    where: eq(groups.id, chatId),
  });

  if (!group) {
    await ctx.reply("Group not set up yet. Run /setup first.");
    return;
  }

  if (!group.multisigAddress) {
    await ctx.reply(
      "No multisig address configured. Use /setup_multisig <address> to set one."
    );
    return;
  }

  try {
    const balance = await getBalance(group.multisigAddress);
    const formatted = formatTON(balance);
    const viewerUrl = getTonviewerUrl(group.multisigAddress);

    await ctx.reply(
      `Multisig Wallet Balance\n\n` +
        `Address: ${group.multisigAddress}\n` +
        `Balance: ${formatted}\n\n` +
        `View on Tonviewer: ${viewerUrl}`,
      { link_preview_options: { is_disabled: true } }
    );
  } catch (error) {
    console.error("Failed to fetch balance:", error);
    await ctx.reply(
      "Failed to fetch wallet balance. Please check the multisig address and try again."
    );
  }
});

export default composer;
