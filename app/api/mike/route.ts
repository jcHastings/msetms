import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { isOpenAiConfigured, loadRuntimeEnv } from "@/lib/env";
import { askMike, readMikeHistory, writeMikeHistory } from "@/lib/mike";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await loadRuntimeEnv();
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) {
    return Response.json({ ok: false, error: "Sign in as a dispatcher to continue." }, { status: 401 });
  }
  return Response.json({ ok: true, configured: isOpenAiConfigured() });
}

export async function POST(request: Request) {
  await loadRuntimeEnv();
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) {
    return Response.json({ ok: false, error: "Sign in as a dispatcher to continue." }, { status: 401 });
  }
  let question = "";
  try {
    const body = (await request.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    question = "";
  }
  const history = await readMikeHistory();
  if (!question) {
    return Response.json({ ok: false, error: "Type a question for Mike.", configured: isOpenAiConfigured(), messages: history });
  }
  const result = await askMike(question, history);
  const messages = (
    [...history, { role: "user" as const, content: question }, { role: "assistant" as const, content: result.reply }]
  ).slice(-8);
  await writeMikeHistory(messages);
  return Response.json({ ok: true, configured: result.configured, messages });
}
