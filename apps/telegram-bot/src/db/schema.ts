import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(), // telegram chat id
  title: text("title"),
  multisigAddress: text("multisig_address"),
  threshold: integer("threshold").default(2).notNull(),
  orderSeqno: integer("order_seqno").default(0).notNull(),
  apiKey: text("api_key"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey(), // `${groupId}:${userId}`
  groupId: text("group_id").references(() => groups.id).notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  telegramUsername: text("telegram_username"),
  displayName: text("display_name"),
  publicKey: text("public_key"),
  signerIndex: integer("signer_index"),
  joinedAt: text("joined_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(), // nanoid
  groupId: text("group_id").references(() => groups.id).notNull(),
  action: text("action").notNull(), // send | add_member | remove_member | change_threshold
  amount: text("amount"),
  recipient: text("recipient"),
  reason: text("reason").notNull(),
  proposedBy: text("proposed_by").notNull(),
  orderSeqno: integer("order_seqno"),
  status: text("status").default("pending").notNull(), // pending | approved | executed | rejected | expired
  votesFor: integer("votes_for").default(0).notNull(),
  votesAgainst: integer("votes_against").default(0).notNull(),
  threshold: integer("threshold").notNull(),
  messageId: text("message_id"),
  txHash: text("tx_hash"),
  expiresAt: text("expires_at"),
  executedAt: text("executed_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const votes = sqliteTable("votes", {
  id: text("id").primaryKey(), // `${proposalId}:${userId}`
  proposalId: text("proposal_id").references(() => proposals.id).notNull(),
  telegramUserId: text("telegram_user_id").notNull(),
  approve: integer("approve", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(members),
  proposals: many(proposals),
}));

export const membersRelations = relations(members, ({ one }) => ({
  group: one(groups, { fields: [members.groupId], references: [groups.id] }),
}));

export const proposalsRelations = relations(proposals, ({ one, many }) => ({
  group: one(groups, { fields: [proposals.groupId], references: [groups.id] }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  proposal: one(proposals, { fields: [votes.proposalId], references: [proposals.id] }),
}));
