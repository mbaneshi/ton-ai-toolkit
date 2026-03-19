import { Composer } from "grammy";
import { MyContext } from "../context";
import { db } from "../../db";
import { groups, proposals } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { formatTON } from "../../utils/format";

const composer = new Composer<MyContext>();

composer.command("proposals", async (ctx) => {
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

  const pendingProposals = await db.query.proposals.findMany({
    where: and(
      eq(proposals.groupId, chatId),
      eq(proposals.status, "pending")
    ),
    orderBy: (proposals, { desc }) => [desc(proposals.createdAt)],
  });

  if (pendingProposals.length === 0) {
    await ctx.reply("No pending proposals. Use /propose to create one.");
    return;
  }

  const lines = pendingProposals.map((p, i) => {
    const actionText = formatAction(p);
    const progressBar = makeProgressBar(p.votesFor, p.threshold);
    const expired =
      p.expiresAt && new Date().toISOString() > p.expiresAt ? " [EXPIRED]" : "";

    return (
      `${i + 1}. #${p.id}${expired}\n` +
      `   ${actionText}\n` +
      `   Reason: ${p.reason}\n` +
      `   Votes: ${progressBar} ${p.votesFor}/${p.threshold} approvals, ${p.votesAgainst} rejections`
    );
  });

  await ctx.reply(
    `Pending Proposals (${pendingProposals.length})\n\n${lines.join("\n\n")}`
  );
});

function formatAction(p: {
  action: string;
  amount: string | null;
  recipient: string | null;
}): string {
  switch (p.action) {
    case "send":
      return `Send ${formatTON(p.amount)} TON${p.recipient ? ` to ${p.recipient}` : ""}`;
    case "add_member":
      return `Add member ${p.recipient || "?"}`;
    case "remove_member":
      return `Remove member ${p.recipient || "?"}`;
    case "change_threshold":
      return `Change threshold to ${p.amount || "?"}`;
    default:
      return p.action;
  }
}

function makeProgressBar(current: number, total: number): string {
  const filled = Math.min(current, total);
  const empty = total - filled;
  return "[" + "=".repeat(filled) + "-".repeat(empty) + "]";
}

export default composer;
