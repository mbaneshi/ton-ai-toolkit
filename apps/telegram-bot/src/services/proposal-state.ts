/**
 * Proposal state machine — pattern learned from izEscrowAI.
 *
 * Strict transition matrix prevents invalid state changes.
 * Each transition is validated before DB writes.
 */

export type ProposalStatus = 'pending' | 'approved' | 'executed' | 'rejected' | 'expired'

/**
 * Valid state transitions matrix.
 * Maps current status → list of allowed next statuses.
 */
const VALID_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  pending:  ['approved', 'rejected', 'expired'],
  approved: ['executed'],
  executed: [],              // terminal
  rejected: [],              // terminal
  expired:  [],              // terminal
}

/**
 * Check if a status transition is valid.
 */
export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Validate a transition and throw a descriptive error if invalid.
 */
export function assertTransition(from: ProposalStatus, to: ProposalStatus, proposalId: string): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid proposal transition: ${from} → ${to} (proposal ${proposalId}). ` +
      `Allowed from "${from}": [${VALID_TRANSITIONS[from].join(', ')}]`
    )
  }
}

/**
 * Check if a proposal status is terminal (no further transitions possible).
 */
export function isTerminal(status: ProposalStatus): boolean {
  return VALID_TRANSITIONS[status]?.length === 0
}
