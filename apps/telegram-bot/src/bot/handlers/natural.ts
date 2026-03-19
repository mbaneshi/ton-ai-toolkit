import { Composer, InlineKeyboard } from "grammy";
import { MyContext } from "../context";
import { db } from "../../db";
import { groups, proposals, members } from "../../db/schema";
import { eq } from "drizzle-orm";
import { parseProposalIntent } from "../../services/intent";
import { nanoid } from "nanoid";
import { formatTON } from "../../utils/format";

const PROPOSAL_KEYWORDS = [
  "send",
  "transfer",
  "pay",
  "add",
  "remove",
  "kick",
  "invite",
  "threshold",
  "change",
  "propose",
  "let's",
  "should we",
  "can we",
  "i think we should",
  "we need to",
];

const composer = new Composer<MyContext>();

composer.on("message:text", async (ctx) => {
  // Only in group chats
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    return;
  }

  const text = ctx.message.text;

  // Skip commands
  if (text.startsWith("/")) {
    return;
  }

  // Check if message looks like a proposal
  const lowerText = text.toLowerCase();
  const looksLikeProposal = PROPOSAL_KEYWORDS.some((kw) =>
    lowerText.includes(kw)
  );

  if (!looksLikeProposal) {
    return;
  }

  const chatId = ctx.chat.id.toString();
  const userId = ctx.from?.id.toString();

  if (!userId) return;

  // Check group exists
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, chatId),
  });

  if (!group) return;

  // Check user is a member
  const memberId = `${chatId}:${userId}`;
  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  });

  if (!member) return;

  // Parse intent
  const intent = await parseProposalIntent(text);

  // Only auto-create if confidence is high enough
  if (intent.confidence < 0.7) {
    return;
  }

  const displayName = member.displayName || ctx.from?.first_name || "Unknown";

  // Create proposal automatically
  const proposalId = nanoid(12);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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

  const actionText = formatProposalAction(intent);

  const keyboard = new InlineKeyboard()
    .text(`Approve (0/${group.threshold})`, `vote:${proposalId}:approve`)
    .text(`Reject (0)`, `vote:${proposalId}:reject`);

  const message = await ctx.reply(
    `I detected a proposal in your message and created it automatically:\n\n` +
      `PROPOSAL #${proposalId}\n\n` +
      `${actionText}\n` +
      `Reason: ${intent.reason}\n\n` +
      `Proposed by: ${displayName}\n` +
      `Threshold: ${group.threshold} approvals needed\n` +
      `Expires: ${new Date(expiresAt).toUTCString()}\n\n` +
      `Votes: 0/${group.threshold} approvals, 0 rejections`,
    { reply_markup: keyboard, reply_parameters: { message_id: ctx.message.message_id } }
  );

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
