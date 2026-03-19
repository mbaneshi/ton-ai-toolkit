export const config = {
  network: process.env.NETWORK || 'testnet',
  toncenterApiKey: process.env.TONCENTER_API_KEY || '',
  mnemonic: process.env.MNEMONIC || '',
  dryRun: process.env.TON_DRY_RUN === 'true',
  maxSendAmount: BigInt(process.env.MAX_SEND_TON || '1000') * 1_000_000_000n,

  get endpoint(): string {
    return this.network === 'mainnet'
      ? 'https://toncenter.com/api/v2/jsonRPC'
      : 'https://testnet.toncenter.com/api/v2/jsonRPC'
  },

  get hasWallet(): boolean {
    return this.mnemonic.split(' ').filter(Boolean).length === 24
  },
}
