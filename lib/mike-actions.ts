"use server";

import { requireSignedInDispatcher } from "./dispatcher-session";
import { askMike, readMikeHistory, writeMikeHistory } from "./mike";
import type { MikeMessage } from "./mike-shared";
import { isOpenAiConfigured, loadLocalEnv } from "./env";
import type { ActionResult } from "./types";

export type MikeChatState = ActionResult & {
  messages: MikeMessage[];
  configured: boolean;
};

export async function askMikeAction(
  _prev: MikeChatState | null,
  formData: FormData,
): Promise<MikeChatState> {
  await requireSignedInDispatcher();
  loadLocalEnv({ force: true });
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
    return { ok: true, messages, configured: result.configured };
  } catch {
    return {
      ok: false,
      error: "Mike could not answer. Try again.",
      messages: history,
      configured,
    };
  }
}
