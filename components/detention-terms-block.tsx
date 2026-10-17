import type { DetentionTermLine } from "@/lib/customer-contract-shared";

export function DetentionTermsBlock({ lines }: { lines: DetentionTermLine[] }) {
  return (
    <section className="card mb-4 p-5" data-detention-terms-block="" data-ui="detention-terms">
      <h2 className="text-base font-semibold text-slate-900">Detention terms</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-700">
        Rate confirmation first, then this customer&apos;s contract. A blank field stays missing until the rate confirmation states it.
      </p>
      <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {lines.map((line) => (
          <div key={line.key} className={line.key === "conditions" ? "sm:col-span-2" : undefined}>
            <dt className="text-sm text-slate-600">{line.label}</dt>
            <dd className="mt-0.5 text-sm text-slate-900" data-detention-term={line.key} data-detention-source={line.source}>
              <span>{line.text}</span>
              {line.sourceLabel ? <span className="text-slate-600"> · {line.sourceLabel}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-slate-600">
        Notice lead is what a detention-starting-soon flag will read. This block does not send it.
      </p>
    </section>
  );
}
