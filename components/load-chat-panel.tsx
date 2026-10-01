"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { postLoadChatAction } from "@/lib/actions";
import { FormBanner } from "@/components/form-banner";
import { formatDateTime } from "@/lib/format";
import type { LoadChatMessage } from "@/lib/load-chat";
import type { ActionResult } from "@/lib/types";

export function LoadChatPanel({
  loadId,
  messages,
  role,
}: {
  loadId: number;
  messages: LoadChatMessage[];
  role: "dispatcher" | "driver";
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await postLoadChatAction(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  return (
    <section className={role === "driver" ? "driver-sheet mt-4 rounded-2xl p-4" : "card mt-4 p-4"} data-load-chat="">
      <h2 className="text-sm font-semibold">Load chat</h2>
      <p className={role === "driver" ? "mt-1 text-xs text-slate-600" : "mt-1 text-xs text-slate-500"}>
        Stays on this load. Not a text or email.
      </p>
      <ul className="mt-3 space-y-2" data-load-chat-list="">
        {messages.map((row) => (
          <li key={row.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm" data-load-chat-item="">
            <div className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-800">{row.author_name}</span>
              <span>{formatDateTime(row.created_at)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-slate-800">{row.body}</p>
          </li>
        ))}
        {messages.length === 0 ? <li className="text-sm text-slate-500">No messages yet.</li> : null}
      </ul>
      <FormBanner result={state} />
      <form action={formAction} className="mt-3 space-y-2" data-load-chat-form="">
        <input type="hidden" name="load_id" value={loadId} />
        <input type="hidden" name="role" value={role} />
        <label className="sr-only" htmlFor={`load-chat-${loadId}-${role}`}>
          Message
        </label>
        <textarea
          id={`load-chat-${loadId}-${role}`}
          name="body"
          rows={2}
          required
          maxLength={2000}
          placeholder="Message about this load"
          data-load-chat-input=""
        />
        <button className="btn btn-primary" type="submit" disabled={pending} data-load-chat-send="">
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}
