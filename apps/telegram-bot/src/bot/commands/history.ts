import { Composer } from "grammy";
import { MyContext } from "../context";
import { db } from "../../db";
import { groups, proposals } from "../../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { formatTON } from "../../utils/format";

const composer = new Composer<MyContext>();

composer.command("history", async (ctx) => {
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

  const pastProposals = await db.query.proposals.findMany({
    where: and(
      eq(proposals.groupId, chatId),
      inArray(proposals.status, ["executed", "approved", "rejected", "expired"])
    ),
    orderBy: (proposals, { desc }) => [desc(proposals.createdAt)],
    limit: 10,
  });

  if (pastProposals.length === 0) {
    await ctx.reply("No proposal history yet.");
    return;
  }

  const lines = pastProposals.map((p, i) => {
    const actionText = formatAction(p);
    const statusIcon = getStatusIcon(p.status);
    const executedInfo = p.executedAt
      ? `\n   Executed: ${new Date(p.executedAt).toUTCString()}`
      : "";

    return (
      `${i + 1}. ${statusIcon} #${p.id}\n` +
      `   ${actionText}\n` +
      `   Reason: ${p.reason}\n` +
      `   Final votes: ${p.votesFor} approvals, ${p.votesAgainst} rejections` +
      executedInfo
    );
  });

  await ctx.reply(
    `Proposal History (last ${pastProposals.length})\n\n${lines.join("\n\n")}`
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

function getStatusIcon(status: string): string {
  switch (status) {
    case "executed":
      return "[EXECUTED]";
    case "approved":
      return "[APPROVED]";
    case "rejected":
      return "[REJECTED]";
    case "expired":
      return "[EXPIRED]";
    default:
      return `[${status.toUpperCase()}]`;
  }
}

export default composer;
