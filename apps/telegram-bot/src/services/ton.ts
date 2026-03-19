import { TonClient, WalletContractV4, internal } from "@ton/ton";
import { Address, fromNano, toNano, beginCell } from "@ton/core";
import { mnemonicToPrivateKey, KeyPair } from "@ton/crypto";

let tonClient: TonClient | null = null;

export function getClient(): TonClient {
  if (!tonClient) {
    const endpoint = process.env.TON_ENDPOINT;
    if (!endpoint) {
      throw new Error("TON_ENDPOINT environment variable is not set");
    }
    tonClient = new TonClient({
      endpoint,
      apiKey: process.env.TON_API_KEY || undefined,
    });
  }
  return tonClient;
}

export async function getBalance(address: string): Promise<bigint> {
  const client = getClient();
  const addr = Address.parse(address);
  return client.getBalance(addr);
}

export async function getSeqno(address: string): Promise<number> {
  const client = getClient();
  const addr = Address.parse(address);
  const result = await client.runMethod(addr, "seqno");
  return result.stack.readNumber();
}

export async function waitForTransaction(
  address: string,
  previousLt: string,
  maxRetries: number = 30,
  intervalMs: number = 2000
): Promise<boolean> {
  const client = getClient();
  const addr = Address.parse(address);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const txs = await client.getTransactions(addr, { limit: 1 });
      if (txs.length > 0 && txs[0].lt.toString() !== previousLt) {
        return true;
      }
    } catch {
      // Ignore polling errors
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

export function formatTON(nanoton: bigint): string {
  const tonStr = fromNano(nanoton);
  // Remove trailing zeros but keep at least 2 decimal places for clarity
  const num = parseFloat(tonStr);
  if (num === Math.floor(num)) {
    return `${num} TON`;
  }
  return `${tonStr} TON`;
}

export function parseTON(amount: string): bigint {
  // Remove any "TON" suffix and whitespace
  const cleaned = amount.replace(/\s*TON\s*/i, "").trim();
  return toNano(cleaned);
}

export function validateAddress(addr: string): boolean {
  try {
    Address.parse(addr);
    return true;
  } catch {
    return false;
  }
}

export function normalizeAddress(
  addr: string,
  bounceable: boolean = true
): string {
  const address = Address.parse(addr);
  return address.toString({
    bounceable,
    testOnly: process.env.TON_NETWORK === "testnet",
  });
}

export function getTonviewerUrl(address: string): string {
  const network = process.env.TON_NETWORK === "testnet" ? "testnet." : "";
  return `https://${network}tonviewer.com/${address}`;
}

// --- Wallet send (direct transfer, not multisig) ---

let _keyPair: KeyPair | null = null;
let _wallet: WalletContractV4 | null = null;

async function getWallet(): Promise<{ wallet: WalletContractV4; keyPair: KeyPair }> {
  if (_keyPair && _wallet) return { wallet: _wallet, keyPair: _keyPair };

  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) throw new Error("MNEMONIC not set");

  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 24) throw new Error("MNEMONIC must be 24 words");

  _keyPair = await mnemonicToPrivateKey(words);
  _wallet = WalletContractV4.create({ workchain: 0, publicKey: _keyPair.publicKey });
  return { wallet: _wallet, keyPair: _keyPair };
}

export async function getWalletAddress(): Promise<string> {
  const { wallet } = await getWallet();
  return wallet.address.toString({ testOnly: process.env.TON_NETWORK === "testnet" });
}

export async function sendTransfer(
  to: string,
  amount: bigint,
  comment?: string
): Promise<string> {
  const client = getClient();
  const { wallet, keyPair } = await getWallet();

  const contract = client.open(wallet);
  const seqno = await contract.getSeqno();

  // Build comment body
  const body = comment
    ? beginCell()
        .storeUint(0, 32) // text comment opcode
        .storeStringTail(comment)
        .endCell()
    : undefined;

  await contract.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [
      internal({
        to: Address.parse(to),
        value: amount,
        body,
        bounce: false,
      }),
    ],
  });

  // Wait for confirmation
  const walletAddr = wallet.address.toString({ testOnly: process.env.TON_NETWORK === "testnet" });

  // Return a tonviewer URL for the wallet (tx hash isn't available immediately)
  return walletAddr;
}
