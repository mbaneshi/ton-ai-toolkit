import { Context, SessionFlavor } from "grammy";
import { ProposalIntent } from "../services/intent";

export interface SessionData {
  groupId?: string;
  setupStep?: "threshold" | "members" | null;
  pendingProposal?: ProposalIntent | null;
}

export type MyContext = Context & SessionFlavor<SessionData>;

export function initialSessionData(): SessionData {
  return {
    groupId: undefined,
    setupStep: null,
    pendingProposal: null,
  };
}
