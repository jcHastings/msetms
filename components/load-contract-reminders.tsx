import Link from "next/link";
import { RequirementReminderActions } from "@/components/requirement-reminder-actions";
import type { LoadReminder } from "@/lib/customer-contracts";
import { requirementTriggerLabel } from "@/lib/customer-contract-shared";
import { formatDateTime } from "@/lib/format";

export function LoadContractReminders({
  reminders,
  canEdit,
  heading = "Contract reminders",
  showLoad = false,
  emptyLabel = "No contract reminders on this load.",
}: {
  reminders: LoadReminder[];
  canEdit: boolean;
  heading?: string;
  showLoad?: boolean;
  emptyLabel?: string;
}) {
  return (
    <section className="card mb-4 p-5" data-load-reminders="" data-ui="contract-reminders">
      <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-700">
        Flags from the customer contract. Done and Snooze stay on the desk. Nothing is sent.
      </p>
      {reminders.length === 0 ? (
        <p className="mt-4 text-sm text-slate-700">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reminders.map((item) => (
            <li
              key={`${item.loadId}-${item.requirementId}`}
              className={item.overdue ? "bg-rose-50 px-3 py-3 text-rose-950" : "bg-slate-50 px-3 py-3 text-slate-900"}
              data-reminder={item.requirementId}
              data-reminder-overdue={item.overdue ? "" : undefined}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  {showLoad ? (
                    <Link href={`/loads/${item.loadId}`} className="hover:underline">
                      {item.loadNumber}
                    </Link>
                  ) : null}
                  {showLoad ? " · " : null}
                  {item.requirement}
                </p>
                <p className="text-sm">
                  {item.overdue ? "Overdue · " : item.status === "done" ? "Done · " : item.status === "snoozed" ? "Snoozed · " : "Due · "}
                  {item.dueAt ? formatDateTime(item.dueAt) : item.waiting}
                </p>
              </div>
              <p className="mt-1 text-sm text-slate-700">
                {requirementTriggerLabel(item.trigger)}
                {item.page ? ` · ${item.page}` : ""}
                {item.snoozeUntil && item.status === "snoozed" ? ` · until ${formatDateTime(item.snoozeUntil)}` : ""}
              </p>
              {item.quotedClause ? <p className="mt-2 text-sm text-slate-800">{item.quotedClause}</p> : null}
              {canEdit ? (
                <div className="mt-3">
                  <RequirementReminderActions
                    loadId={item.loadId}
                    requirementId={item.requirementId}
                    status={item.status}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
