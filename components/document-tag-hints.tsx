"use client";

import { DOCUMENT_TAG_HINTS } from "@/lib/document-tags";

const TAG_HELP: Record<string, string> = {
  "[org_name]": "Your organization's name",
  "[user_name]": "Your full name",
  "[user_email]": "Your email",
  "[user_phone]": "Your phone number",
  "[load_id]": "The load number",
  "[customer_name]": "Customer name",
  "[customer_phone]": "Customer phone",
};

export function DocumentTagHints() {
  return (
    <div className="mb-4 rounded border border-rose-200 bg-rose-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-800">Heads up</div>
      <p className="mt-0.5 text-[12px] text-rose-900">
        Optional tags insert live values on the PDF. They stay as typed if that field is empty.
      </p>
      <ul className="mt-2 grid gap-1 text-[12px] text-rose-950 sm:grid-cols-2">
        {DOCUMENT_TAG_HINTS.map((tag) => (
          <li key={tag}>
            <button
              type="button"
              className="font-mono text-rose-800 underline"
              onClick={() => void navigator.clipboard?.writeText(tag)}
            >
              {tag}
            </button>
            <span className="text-rose-800"> — {TAG_HELP[tag] ?? ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
