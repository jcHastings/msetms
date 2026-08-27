"use server";

import { requireCapability, requireSignedInDispatcher } from "./dispatcher-session";
import { askMike, readMikeHistory, writeMikeHistory } from "./mike";
import type { MikeMessage, MikeProposal, MikeProposalKind } from "./mike-shared";
import { applyMikeProposal } from "./mike-work";
import { isOpenAiConfigured, loadRuntimeEnv } from "./env";
import { canSendSms } from "./settings-shared";
import type { ActionResult } from "./types";

export type MikeChatState = ActionResult & {
  messages: MikeMessage[];
  configured: boolean;
  proposals?: MikeProposal[];
};

export async function askMikeAction(
  _prev: MikeChatState | null,
  formData: FormData,
): Promise<MikeChatState> {
  await requireSignedInDispatcher();
  await loadRuntimeEnv();
  const configured = isOpenAiConfigured();
  const history = await readMikeHistory();
  const question = String(formData.get("question") ?? "").trim();
  if (!question) {
    return { ok: false, error: "Type a question for Mike.", messages: history, configured };
  }
  try {
    const result = await askMike(question, history);
    const messages: MikeMessage[] = (
      [...history, { role: "user" as const, content: question }, { role: "assistant" as const, content: result.reply }]
    ).slice(-8);
    await writeMikeHistory(messages);
    return { ok: true, messages, configured: result.configured, proposals: result.proposals };
  } catch {
    return {
      ok: false,
      error: "Mike could not answer. Try again.",
      messages: history,
      configured,
    };
  }
}

export async function confirmMikeProposalAction(formData: FormData): Promise<ActionResult> {
  await requireSignedInDispatcher();
  const kind = String(formData.get("kind") ?? "") as MikeProposalKind;
  const payload: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "kind") continue;
    payload[key] = String(value);
  }
  try {
    if (kind === "driver_message") {
      await requireCapability(canSendSms, "Texting is for Administrator and Standard.");
      const { sendTwilioSms, twilioConfigured } = await import("./integrations/twilio");
      const { SMS_MISSING_KEYS } = await import("./sms-shared");
      if (!twilioConfigured()) throw new Error(SMS_MISSING_KEYS);
      const { getLoad } = await import("./queries");
      const loadId = Number(payload.load_id);
      const load = getLoad(loadId);
      if (!load) throw new Error("Load is missing.");
      if (!load.driver_phone?.trim()) throw new Error("The assigned driver needs a mobile number.");
      await sendTwilioSms({ to: load.driver_phone, body: payload.body || "" });
      return { ok: true, id: loadId, message: "Text sent." };
    }
    const result = applyMikeProposal(payload, kind);
    return { ok: true, message: result.message, id: payload.load_id ? Number(payload.load_id) : undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not confirm that." };
  }
}
