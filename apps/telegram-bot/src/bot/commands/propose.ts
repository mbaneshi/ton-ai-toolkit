import { Composer, InlineKeyboard } from "grammy";
import { MyContext } from "../context";
import { db } from "../../db";
import { groups, proposals, members } from "../../db/schema";
import { eq } from "drizzle-orm";
import { parseProposalIntent } from "../../services/intent";
import { nanoid } from "nanoid";
import { formatTON } from "../../utils/format";

const composer = new Composer<MyContext>();

composer.command("propose", async (ctx) => {
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    await ctx.reply("This command only works in group chats.");
    return;
  }

  const chatId = ctx.chat.id.toString();
  const userId = ctx.from?.id.toString();
  const text = ctx.match?.trim();

  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  if (!text) {
    await ctx.reply(
      "Usage: /propose <description>\n\n" +
        "Examples:\n" +
        '  /propose Send 5 TON to EQAbc... for marketing expenses\n' +
        "  /propose Add @newmember to the multisig\n" +
        "  /propose Change threshold to 3 signatures"
    );
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

  // Check user is a member
  const memberId = `${chatId}:${userId}`;
  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  });

  if (!member) {
    await ctx.reply("You must be a registered member to create proposals. Run /register first.");
    return;
  }

  await ctx.reply("Analyzing your proposal...");

  // Parse intent
  const intent = await parseProposalIntent(text);

  if (intent.confidence < 0.5) {
    await ctx.reply(
      `I'm not confident I understood your proposal correctly (${Math.round(intent.confidence * 100)}% confidence).\n\n` +
        `Parsed as:\n${formatProposalAction(intent)}\n` +
        `Reason: ${intent.reason}\n\n` +
        `Please try rephrasing more clearly.`
    );
    return;
  }

  // Create proposal
  const proposalId = nanoid(12);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  const displayName = member.displayName || ctx.from?.first_name || "Unknown";

  await db.insert(proposals).values({
    id: proposalId,
    groupId: chatId,
    action: intent.action,
    amount: intent.amount || null,
    recipient: intent.recipient || null,
    reason: intent.reason,
    proposedBy: userId,
    status: "pending",
    votesFor: 0,
    votesAgainst: 0,
    threshold: group.threshold,
    expiresAt,
  });

  // Build proposal message
  const actionText = formatProposalAction(intent);

  const keyboard = new InlineKeyboard()
    .text(`Approve (0/${group.threshold})`, `vote:${proposalId}:approve`)
    .text(`Reject (0)`, `vote:${proposalId}:reject`);

  const message = await ctx.reply(
    `NEW PROPOSAL #${proposalId}\n\n` +
      `${actionText}\n` +
      `Reason: ${intent.reason}\n\n` +
      `Proposed by: ${displayName}\n` +
      `Threshold: ${group.threshold} approvals needed\n` +
      `Expires: ${new Date(expiresAt).toUTCString()}\n\n` +
      `Votes: 0/${group.threshold} approvals, 0 rejections`,
    { reply_markup: keyboard }
  );

  // Store message ID for later updates
  await db
    .update(proposals)
    .set({ messageId: message.message_id.toString() })
    .where(eq(proposals.id, proposalId));
});

function formatProposalAction(intent: {
  action: string;
  amount?: string;
  recipient?: string;
}): string {
  switch (intent.action) {
    case "send":
      return `Action: Send ${formatTON(intent.amount)} TON${intent.recipient ? ` to ${intent.recipient}` : ""}`;
    case "add_member":
      return `Action: Add member ${intent.recipient || "?"}`;
    case "remove_member":
      return `Action: Remove member ${intent.recipient || "?"}`;
    case "change_threshold":
      return `Action: Change approval threshold to ${intent.amount || "?"}`;
    default:
      return `Action: ${intent.action}`;
  }
}

export default composer;
