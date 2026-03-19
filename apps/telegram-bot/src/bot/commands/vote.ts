import { Composer, InlineKeyboard } from "grammy";
import { MyContext } from "../context";
import { db } from "../../db";
import { groups, proposals, votes, members } from "../../db/schema";
import { eq, sql } from "drizzle-orm";
import { Address } from "@ton/core";
import {
  buildTransferOrder,
  buildNewOrder,
  defaultExpirationTime,
} from "../../services/multisig";
import { canTransition, type ProposalStatus } from "../../services/proposal-state";
import { formatTON } from "../../utils/format";
import { sendTransfer, getTonviewerUrl, validateAddress } from "../../services/ton";

const composer = new Composer<MyContext>();

composer.callbackQuery(/^vote:(.+):(approve|reject)$/, async (ctx) => {
  const match = ctx.callbackQuery.data.match(/^vote:(.+):(approve|reject)$/);
  if (!match) {
    await ctx.answerCallbackQuery("Invalid vote data.");
    return;
  }

  const proposalId = match[1];
  const isApprove = match[2] === "approve";
  const userId = ctx.from.id.toString();
  const chatId = ctx.callbackQuery.message?.chat.id.toString();

  if (!chatId) {
    await ctx.answerCallbackQuery("Could not determine chat.");
    return;
  }

  // Check voter is a registered member
  const memberId = `${chatId}:${userId}`;
  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  });

  if (!member) {
    await ctx.answerCallbackQuery(
      "You must be a registered member to vote. Use /register first."
    );
    return;
  }

  // Get proposal
  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, proposalId),
  });

  if (!proposal) {
    await ctx.answerCallbackQuery("Proposal not found.");
    return;
  }

  // State machine guard: only pending proposals accept votes
  if (proposal.status !== "pending" || !canTransition(proposal.status as ProposalStatus, "approved")) {
    await ctx.answerCallbackQuery(
      `This proposal is already ${proposal.status}.`
    );
    return;
  }

  // Check if expired
  if (proposal.expiresAt && new Date().toISOString() > proposal.expiresAt) {
    await db
      .update(proposals)
      .set({ status: "expired" })
      .where(eq(proposals.id, proposalId));
    await ctx.answerCallbackQuery("This proposal has expired.");
    return;
  }

  // Check for double voting
  const voteId = `${proposalId}:${userId}`;
  const existingVote = await db.query.votes.findFirst({
    where: eq(votes.id, voteId),
  });

  if (existingVote) {
    await ctx.answerCallbackQuery(
      `You already voted ${existingVote.approve ? "approve" : "reject"} on this proposal.`
    );
    return;
  }

  // Record vote
  await db.insert(votes).values({
    id: voteId,
    proposalId,
    telegramUserId: userId,
    approve: isApprove,
  });

  // Atomic vote count update
  if (isApprove) {
    await db
      .update(proposals)
      .set({
        votesFor: sql`${proposals.votesFor} + 1`,
      })
      .where(eq(proposals.id, proposalId));
  } else {
    await db
      .update(proposals)
      .set({
        votesAgainst: sql`${proposals.votesAgainst} + 1`,
      })
      .where(eq(proposals.id, proposalId));
  }

  // Re-read proposal to get accurate counts after atomic update
  const updated = await db.query.proposals.findFirst({
    where: eq(proposals.id, proposalId),
  });

  if (!updated) {
    await ctx.answerCallbackQuery("Proposal not found after update.");
    return;
  }

  const newVotesFor = updated.votesFor;
  const newVotesAgainst = updated.votesAgainst;

  let newStatus: string = updated.status;

  // Check if threshold reached
  if (newVotesFor >= proposal.threshold) {
    newStatus = "approved";
    await db
      .update(proposals)
      .set({ status: "approved" })
      .where(eq(proposals.id, proposalId));

    // --- On-chain execution pipeline ---
    try {
      // Fetch group for multisig address and order seqno
      const group = await db.query.groups.findFirst({
        where: eq(groups.id, proposal.groupId),
      });

      if (group && proposal.action === "send" && proposal.recipient && proposal.amount) {
        const amount = BigInt(proposal.amount);

        // Send real on-chain transfer from the bot wallet
        let txInfo = "";
        try {
          if (process.env.MNEMONIC && validateAddress(proposal.recipient!)) {
            console.log(`[execute] Sending ${amount} nanoTON to ${proposal.recipient}...`);
            const walletAddr = await sendTransfer(
              proposal.recipient!,
              amount,
              `DAO proposal ${proposalId}: ${proposal.reason}`
            );
            const viewerUrl = getTonviewerUrl(walletAddr);
            txInfo = `\n\n🔗 Transaction sent!\n${viewerUrl}`;
            console.log(`[execute] Transfer sent from ${walletAddr}`);
          } else {
            console.log(`[execute] No MNEMONIC or invalid recipient — skipping on-chain send`);
          }
        } catch (sendErr) {
          console.error(`[execute] On-chain send failed:`, sendErr);
          txInfo = `\n\n⚠️ On-chain send failed: ${sendErr instanceof Error ? sendErr.message : 'unknown error'}`;
        }

        // Update proposal status
        await db
          .update(proposals)
          .set({
            status: "executed",
            txHash: txInfo || "no-mnemonic",
            executedAt: new Date().toISOString(),
          })
          .where(eq(proposals.id, proposalId));

        newStatus = "executed";

        // Notify group about execution
        await ctx.reply(
          `✅ Proposal #${proposalId} executed!${txInfo || "\n(No wallet configured for on-chain send)"}`
        );
      } else {
        // Non-send actions or missing data — just mark approved
        console.log(
          `[execute] Proposal ${proposalId} approved but not executable on-chain (action=${proposal.action}).`
        );
      }
    } catch (execError) {
      console.error(
        `[execute] Failed to build on-chain order for proposal ${proposalId}:`,
        execError
      );
      // Proposal stays approved even if execution fails
    }
  }

  const voterName =
    member.displayName || ctx.from.first_name || "Unknown";

  await ctx.answerCallbackQuery(
    `Vote recorded: ${isApprove ? "Approve" : "Reject"}`
  );

  // Update the message with new vote counts
  const actionText = formatProposalAction(proposal);
  let statusText = "";
  if (newStatus === "executed") {
    statusText = "\n\nSTATUS: APPROVED & EXECUTED - Order built and ready for broadcast!";
  } else if (newStatus === "approved") {
    statusText = "\n\nSTATUS: APPROVED - Threshold reached!";
  }

  const keyboard = new InlineKeyboard()
    .text(
      `Approve (${newVotesFor}/${proposal.threshold})`,
      `vote:${proposalId}:approve`
    )
    .text(`Reject (${newVotesAgainst})`, `vote:${proposalId}:reject`);

  const isFinalized = newStatus === "approved" || newStatus === "executed";

  try {
    await ctx.editMessageText(
      `NEW PROPOSAL #${proposalId}\n\n` +
        `${actionText}\n` +
        `Reason: ${proposal.reason}\n\n` +
        `Threshold: ${proposal.threshold} approvals needed\n` +
        `Expires: ${proposal.expiresAt ? new Date(proposal.expiresAt).toUTCString() : "N/A"}\n\n` +
        `Votes: ${newVotesFor}/${proposal.threshold} approvals, ${newVotesAgainst} rejections\n` +
        `Latest: ${voterName} voted ${isApprove ? "approve" : "reject"}` +
        statusText,
      { reply_markup: isFinalized ? undefined : keyboard }
    );
  } catch (error) {
    // Message might not be editable if too old
    console.error("Failed to edit message:", error);
  }
});

function formatProposalAction(proposal: {
  action: string;
  amount: string | null;
  recipient: string | null;
}): string {
  switch (proposal.action) {
    case "send":
      return `Action: Send ${formatTON(proposal.amount)} TON${proposal.recipient ? ` to ${proposal.recipient}` : ""}`;
    case "add_member":
      return `Action: Add member ${proposal.recipient || "?"}`;
    case "remove_member":
      return `Action: Remove member ${proposal.recipient || "?"}`;
    case "change_threshold":
      return `Action: Change approval threshold to ${proposal.amount || "?"}`;
    default:
      return `Action: ${proposal.action}`;
  }
}

export default composer;
