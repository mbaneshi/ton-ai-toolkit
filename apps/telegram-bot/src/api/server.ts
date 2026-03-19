import http from "node:http";
import { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { db } from "../db";
import { groups, proposals } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

const TON_ADDRESS_REGEX = /^(EQ|UQ|0:|kQ)[A-Za-z0-9_\-+/]{46,48}$/;

interface ProposeRequestBody {
  group_id: string;
  to: string;
  amount: string;
  memo: string;
  auth_token: string;
}

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function jsonResponse(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>
) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function validateTonAddress(address: string): boolean {
  return TON_ADDRESS_REGEX.test(address);
}

function validateAmount(amount: string): { valid: boolean; error?: string } {
  const num = Number(amount);
  if (isNaN(num)) {
    return { valid: false, error: "Amount must be a valid number" };
  }
  if (num <= 0) {
    return { valid: false, error: "Amount must be greater than 0" };
  }
  if (num > 1000) {
    return { valid: false, error: "Amount must not exceed 1000 TON" };
  }
  return { valid: true };
}

async function handlePropose<C extends Context>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bot: Bot<C>
) {
  try {
    const rawBody = await parseBody(req);
    let body: ProposeRequestBody;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse(res, 400, { error: "Invalid JSON body" });
    }

    // Validate required fields
    const { group_id, to, amount, memo, auth_token } = body;

    if (!group_id || !to || !amount || !memo || !auth_token) {
      return jsonResponse(res, 400, {
        error:
          "Missing required fields: group_id, to, amount, memo, auth_token",
      });
    }

    // Validate TON address
    if (!validateTonAddress(to)) {
      return jsonResponse(res, 400, {
        error: "Invalid TON address format",
      });
    }

    // Validate amount
    const amountCheck = validateAmount(amount);
    if (!amountCheck.valid) {
      return jsonResponse(res, 400, { error: amountCheck.error });
    }

    // Look up the group
    const group = await db.query.groups.findFirst({
      where: eq(groups.id, group_id),
    });

    if (!group) {
      return jsonResponse(res, 404, { error: "Group not found" });
    }

    // Validate auth token
    if (!group.apiKey) {
      return jsonResponse(res, 401, {
        error:
          "This group has no API key configured. Use /apikey in the group to generate one.",
      });
    }

    if (group.apiKey !== auth_token) {
      return jsonResponse(res, 401, { error: "Invalid auth_token" });
    }

    // Convert TON amount to nanoTON string
    const amountNum = Number(amount);
    const nanoTon = BigInt(Math.round(amountNum * 1e9)).toString();

    // Create proposal
    const proposalId = nanoid(12);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    await db.insert(proposals).values({
      id: proposalId,
      groupId: group_id,
      action: "send",
      amount: nanoTon,
      recipient: to,
      reason: memo,
      proposedBy: "api-agent",
      status: "pending",
      votesFor: 0,
      votesAgainst: 0,
      threshold: group.threshold,
      expiresAt,
    });

    // Send notification to the Telegram group
    const keyboard = new InlineKeyboard()
      .text(`Approve (0/${group.threshold})`, `vote:${proposalId}:approve`)
      .text(`Reject (0)`, `vote:${proposalId}:reject`);

    const messageText =
      `NEW PROPOSAL #${proposalId} (via API)\n\n` +
      `Action: Send ${amount} TON to ${to}\n` +
      `Reason: ${memo}\n\n` +
      `Proposed by: External Agent\n` +
      `Threshold: ${group.threshold} approvals needed\n` +
      `Expires: ${new Date(expiresAt).toUTCString()}\n\n` +
      `Votes: 0/${group.threshold} approvals, 0 rejections`;

    try {
      const message = await bot.api.sendMessage(Number(group_id), messageText, {
        reply_markup: keyboard,
      });

      // Store message ID for later vote updates
      await db
        .update(proposals)
        .set({ messageId: message.message_id.toString() })
        .where(eq(proposals.id, proposalId));
    } catch (telegramErr) {
      console.error("Failed to send Telegram notification:", telegramErr);
      // Proposal is still created, just notification failed
    }

    return jsonResponse(res, 200, {
      proposal_id: proposalId,
      status: "pending",
      message: "Proposal submitted to group for approval",
    });
  } catch (err) {
    console.error("Error handling /agent/propose:", err);
    return jsonResponse(res, 500, { error: "Internal server error" });
  }
}

async function handleHealth(
  _req: http.IncomingMessage,
  res: http.ServerResponse
) {
  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(groups);
    const groupCount = Number(result[0]?.count ?? 0);
    return jsonResponse(res, 200, { status: "ok", groups: groupCount });
  } catch (err) {
    console.error("Health check error:", err);
    return jsonResponse(res, 500, { status: "error", groups: 0 });
  }
}

function handleAgentInfo(
  _req: http.IncomingMessage,
  res: http.ServerResponse
) {
  return jsonResponse(res, 200, {
    name: "TON DAO Agent",
    version: "0.1.0",
    description:
      "Telegram bot for group multisig wallet management via natural language",
    capabilities: [
      "multisig_transfer",
      "member_management",
      "threshold_change",
    ],
    payment_methods: ["TON"],
    network: process.env.TON_NETWORK || "testnet",
    mcp_compatible: true,
    a2a_endpoint: "/agent/propose",
    endpoints: {
      propose: { method: "POST", path: "/agent/propose", auth: "bearer" },
      health: { method: "GET", path: "/health" },
      info: { method: "GET", path: "/agent/info" },
    },
  });
}

export function startApiServer<C extends Context>(bot: Bot<C>) {
  const port = parseInt(process.env.PORT || "3000", 10);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase();

    if (method === "POST" && pathname === "/agent/propose") {
      return handlePropose(req, res, bot);
    }

    if (method === "GET" && pathname === "/health") {
      return handleHealth(req, res);
    }

    if (method === "GET" && pathname === "/agent/info") {
      return handleAgentInfo(req, res);
    }

    return jsonResponse(res, 404, { error: "Not found" });
  });

  server.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });

  return server;
}
