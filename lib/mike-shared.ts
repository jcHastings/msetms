export type MikeMessage = { role: "user" | "assistant"; content: string };

export type MikeProposalKind =
  | "detention_email"
  | "classify_document"
  | "status_update"
  | "start_ratecon"
  | "build_tie_sheet"
  | "flag_issue"
  | "driver_message";

export type MikeProposal = {
  id: string;
  kind: MikeProposalKind;
  title: string;
  preview: string;
  payload: Record<string, string>;
};

export const MIKE_MISSING_KEY_MESSAGE = "Mike is not connected.";
