"use server";

import { requireCapability, requireSignedInDispatcher } from "./dispatcher-session";
import { askMike, readMikeHistory, writeMikeHistory } from "./mike";
import type { MikeMessage, MikeProposal, MikeProposalKind } from "./mike-shared";
import { applyMikeProposal } from "./mike-work";
import { isOpenAiConfigured, loadRuntimeEnv } from "./env";
import { canSendSms } from "./settings-shared";
import { isTieSheetImageName } from "./tie-sheet-shared";
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
  const file = formData.get("tie_sheet_image");
  const hasImage = file instanceof File && file.size > 0;
  if (!question && !hasImage) {
    return {
      ok: false,
      error: "Type a question or upload a Tie Sheet picture.",
      messages: history,
      configured,
    };
  }
  try {
    let image: { mimeType: string; buffer: Buffer; filename?: string; inboxId?: string } | null = null;
    let userLine = question;
    if (hasImage && file instanceof File) {
      if (file.size > 8 * 1024 * 1024) {
        return {
          ok: false,
          error: "That picture is over 8 MB. Upload a smaller Tie Sheet snapshot.",
          messages: history,
          configured,
        };
      }
      if (!isTieSheetImageName(file.name, file.type)) {
        return {
          ok: false,
          error: "Upload a picture of the Tie Sheet truck.",
          messages: history,
          configured,
        };
      }
      const { fileToBuffer, saveInboxFile } = await import("./files");
      const buffer = await fileToBuffer(file);
      const { inboxId } = saveInboxFile(file, buffer);
      image = {
        mimeType: file.type || "image/jpeg",
        buffer,
        filename: file.name,
        inboxId,
      };
      userLine = question || `Uploaded a Tie Sheet picture (${file.name})`;
    }
    const result = await askMike(question, history, image);
    const messages: MikeMessage[] = (
      [...history, { role: "user" as const, content: userLine }, { role: "assistant" as const, content: result.reply }]
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
    return {
      ok: true,
      message: result.message,
      id: result.id ?? (payload.load_id ? Number(payload.load_id) : undefined),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not confirm that." };
  }
}
