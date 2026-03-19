import { Composer } from "grammy";
import { MyContext } from "../context";
import { db } from "../../db";
import { groups, members } from "../../db/schema";
import { eq } from "drizzle-orm";

const composer = new Composer<MyContext>();

composer.command("setup", async (ctx) => {
  // Only works in group chats
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    await ctx.reply(
      "This command only works in group chats. Add me to a group to get started."
    );
    return;
  }

  const chatId = ctx.chat.id.toString();
  const chatTitle = ctx.chat.title || "Untitled Group";

  // Check if group already exists
  const existing = await db.query.groups.findFirst({
    where: eq(groups.id, chatId),
  });

  if (existing) {
    await ctx.reply(
      `This group is already set up.\n\n` +
        `Multisig: ${existing.multisigAddress || "Not configured"}\n` +
        `Threshold: ${existing.threshold}\n\n` +
        `Use /setup_multisig <address> to set the multisig address.\n` +
        `Use /setup_threshold <number> to change the threshold.`
    );
    return;
  }

  // Create group record
  await db.insert(groups).values({
    id: chatId,
    title: chatTitle,
    threshold: 2,
  });

  // Register the user who initiated setup as the first member
  const userId = ctx.from?.id.toString();
  const username = ctx.from?.username;
  const displayName =
    ctx.from?.first_name +
    (ctx.from?.last_name ? ` ${ctx.from.last_name}` : "");

  if (userId) {
    const memberId = `${chatId}:${userId}`;
    await db.insert(members).values({
      id: memberId,
      groupId: chatId,
      telegramUserId: userId,
      telegramUsername: username || null,
      displayName: displayName,
      signerIndex: 0,
    });
  }

  await ctx.reply(
    `Group "${chatTitle}" has been set up for DAO management.\n\n` +
      `Default threshold: 2 signatures required\n\n` +
      `Next steps:\n` +
      `1. Set multisig address: /setup_multisig <address>\n` +
      `2. Set threshold: /setup_threshold <number>\n` +
      `3. Add members: /register (each member runs this)\n` +
      `4. Set public key: /setkey <hex_public_key>\n\n` +
      `${displayName} has been registered as signer #0.`
  );
});

composer.command("setup_multisig", async (ctx) => {
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    await ctx.reply("This command only works in group chats.");
    return;
  }

  const chatId = ctx.chat.id.toString();
  const address = ctx.match?.trim();

  if (!address) {
    await ctx.reply("Usage: /setup_multisig <multisig_address>");
    return;
  }

  // Validate TON address format
  try {
    const { Address } = await import("@ton/core");
    Address.parse(address);
  } catch {
    await ctx.reply(
      "Invalid TON address format. Please provide a valid address (EQ... or UQ... or raw 0:...)."
    );
    return;
  }

  await db.update(groups).set({ multisigAddress: address }).where(eq(groups.id, chatId));

  await ctx.reply(`Multisig address set to:\n${address}`);
});

composer.command("setup_threshold", async (ctx) => {
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    await ctx.reply("This command only works in group chats.");
    return;
  }

  const chatId = ctx.chat.id.toString();
  const thresholdStr = ctx.match?.trim();

  if (!thresholdStr) {
    await ctx.reply("Usage: /setup_threshold <number>");
    return;
  }

  const threshold = parseInt(thresholdStr, 10);
  if (isNaN(threshold) || threshold < 1) {
    await ctx.reply("Threshold must be a positive number.");
    return;
  }

  await db.update(groups).set({ threshold }).where(eq(groups.id, chatId));

  await ctx.reply(`Approval threshold set to ${threshold} signatures.`);
});

composer.command("register", async (ctx) => {
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    await ctx.reply("This command only works in group chats.");
    return;
  }

  const chatId = ctx.chat.id.toString();
  const userId = ctx.from?.id.toString();

  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  // Check if group exists
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, chatId),
  });

  if (!group) {
    await ctx.reply("Group not set up yet. Run /setup first.");
    return;
  }

  const memberId = `${chatId}:${userId}`;

  // Check if already registered
  const existing = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  });

  if (existing) {
    await ctx.reply(
      `You are already registered as signer #${existing.signerIndex}.\n` +
        `Public key: ${existing.publicKey || "Not set (use /setkey)"}`
    );
    return;
  }

  // Get the next signer index
  const existingMembers = await db.query.members.findMany({
    where: eq(members.groupId, chatId),
  });
  const nextIndex = existingMembers.length;

  const displayName =
    ctx.from?.first_name +
    (ctx.from?.last_name ? ` ${ctx.from.last_name}` : "");

  await db.insert(members).values({
    id: memberId,
    groupId: chatId,
    telegramUserId: userId,
    telegramUsername: ctx.from?.username || null,
    displayName,
    signerIndex: nextIndex,
  });

  await ctx.reply(
    `${displayName} registered as signer #${nextIndex}.\n` +
      `Set your public key with: /setkey <hex_public_key>`
  );
});

composer.command("setkey", async (ctx) => {
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    await ctx.reply("This command only works in group chats.");
    return;
  }

  const chatId = ctx.chat.id.toString();
  const userId = ctx.from?.id.toString();
  const publicKey = ctx.match?.trim();

  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  if (!publicKey) {
    await ctx.reply("Usage: /setkey <hex_public_key>");
    return;
  }

  // Validate hex format (64 hex chars = 32 bytes ed25519 public key)
  if (!/^[0-9a-fA-F]{64}$/.test(publicKey)) {
    await ctx.reply(
      "Invalid public key format. Expected 64 hex characters (32 bytes ed25519 key)."
    );
    return;
  }

  const memberId = `${chatId}:${userId}`;

  const existing = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  });

  if (!existing) {
    await ctx.reply("You are not registered. Run /register first.");
    return;
  }

  await db
    .update(members)
    .set({ publicKey: publicKey.toLowerCase() })
    .where(eq(members.id, memberId));

  await ctx.reply(`Public key set successfully.`);
});

export default composer;
