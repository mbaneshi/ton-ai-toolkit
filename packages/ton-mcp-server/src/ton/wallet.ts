import { Address, internal, external, storeMessage, SendMode, WalletContractV4 } from '@ton/ton'
import { Cell, beginCell, MessageRelaxed } from '@ton/core'
import { mnemonicToPrivateKey, KeyPair } from '@ton/crypto'
import { config } from '../config.js'
import { TonClientWrapper } from './client.js'

export class WalletManager {
  private keyPair!: KeyPair
  private wallet!: WalletContractV4
  private tonClient: TonClientWrapper

  constructor(tonClient?: TonClientWrapper) {
    this.tonClient = tonClient ?? new TonClientWrapper()
  }

  async init(): Promise<void> {
    if (!config.hasWallet) {
      throw new Error('No mnemonic configured. Set MNEMONIC env variable with 24 words.')
    }

    const words = config.mnemonic.split(' ').filter(Boolean)
    this.keyPair = await mnemonicToPrivateKey(words)
    this.wallet = WalletContractV4.create({
      publicKey: this.keyPair.publicKey,
      workchain: 0,
    })
  }

  getAddress(): Address {
    return this.wallet.address
  }

  getAddressString(): string {
    return this.wallet.address.toString({ bounceable: false })
  }

  async getBalance(): Promise<bigint> {
    const result = await this.tonClient.getBalance(this.wallet.address.toString())
    return BigInt(result.nanoton)
  }

  async getSeqno(): Promise<number> {
    const client = this.tonClient.getClient()
    const contract = client.open(this.wallet)
    try {
      return await contract.getSeqno()
    } catch {
      return 0
    }
  }

  async signAndSend(messages: MessageRelaxed[]): Promise<string> {
    if (config.dryRun) {
      const details = messages.map((msg, i) => {
        let to = 'unknown'
        let amount = '0'
        if (msg.info.type === 'internal') {
          to = msg.info.dest?.toString() ?? 'unknown'
          amount = msg.info.value.coins.toString()
        }
        return `  Message ${i}: to=${to} amount=${amount} nanoTON`
      })
      const log = `[DRY RUN] Would send ${messages.length} message(s):\n${details.join('\n')}`
      return log
    }

    const client = this.tonClient.getClient()
    const contract = client.open(this.wallet)
    const seqno = await this.getSeqno()

    const transfer = contract.createTransfer({
      seqno,
      secretKey: this.keyPair.secretKey,
      messages,
      sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    })

    await contract.send(transfer)

    // Return a pseudo-hash derived from the transfer BOC
    const transferCell = beginCell().store(storeMessage(external({
      to: this.wallet.address,
      body: transfer,
    }))).endCell()
    const hash = transferCell.hash().toString('hex')

    return hash
  }

  async sendTransfer(to: string, amount: bigint, comment?: string, payloadBoc?: string): Promise<string> {
    // Validate amount
    if (amount > config.maxSendAmount) {
      throw new Error(
        `Amount ${amount} nanoTON exceeds maximum allowed ${config.maxSendAmount} nanoTON (${Number(config.maxSendAmount) / 1_000_000_000} TON)`
      )
    }

    if (amount <= 0n) {
      throw new Error('Amount must be positive')
    }

    let body: Cell | undefined
    if (payloadBoc) {
      body = Cell.fromBoc(Buffer.from(payloadBoc, 'base64'))[0]
    } else if (comment) {
      body = beginCell()
        .storeUint(0, 32)
        .storeStringTail(comment)
        .endCell()
    }

    const dest = Address.parse(to)
    const msg = internal({
      to: dest,
      value: amount,
      body: body ?? Cell.EMPTY,
      bounce: dest.workChain === 0,
    })

    return this.signAndSend([msg])
  }
}
