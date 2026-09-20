"use client";

import { useActionState, useMemo, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { groupedAlertTriggers, type AlertTriggerKey } from "@/lib/alert-rules-shared";
import { createAlertRuleAction, deleteAlertRuleAction } from "@/lib/settings-actions";
import type { ActionResult } from "@/lib/types";

export type AlertRuleRow = {
  id: number;
  name: string;
  watching: string;
  actions: string;
  updated_at: string;
};

export function AlertRulesPanel({
  rules,
  users,
  canEdit,
}: {
  rules: AlertRuleRow[];
  users: Array<{ id: number; name: string }>;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {canEdit ? (
          <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
            + Add Alert
          </button>
        ) : (
          <p className="text-sm text-slate-500">Read-only — ask an Administrator to add a rule.</p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="table-grid table-grid-compact">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Watching</th>
              <th>Actions</th>
              <th>Last Edited</th>
              <th>Operations</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                  Add a rule to get started
                </td>
              </tr>
            ) : (
              rules.map((rule, index) => (
                <tr key={rule.id}>
                  <td>{index + 1}</td>
                  <td className="font-medium">{rule.name}</td>
                  <td>{rule.watching}</td>
                  <td>{rule.actions}</td>
                  <td>{rule.updated_at}</td>
                  <td>
                    {canEdit ? (
                      <form action={deleteAlertRuleAction}>
                        <input type="hidden" name="rule_id" value={rule.id} />
                        <button className="acct-link" type="submit">
                          Delete
                        </button>
                      </form>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {open && canEdit ? <CreateAlertModal users={users} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function CreateAlertModal({
  users,
  onClose,
}: {
  users: Array<{ id: number; name: string }>;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await createAlertRuleAction(prev, formData);
      if (result.ok) onClose();
      return result;
    },
    null,
  );
  const [query, setQuery] = useState("");
  const [trigger, setTrigger] = useState<AlertTriggerKey | "">("");
  const groups = groupedAlertTriggers();
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => user.name.toLowerCase().includes(needle));
  }, [query, users]);

  return (
    <div className="pay-item-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pay-item-dialog settings-alert-dialog p-5"
        role="dialog"
        aria-labelledby="create-alert-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="create-alert-title" className="mb-4 text-center text-lg font-semibold text-slate-800">
          Create New Alert
        </h2>
        <form action={formAction} className="space-y-3">
          <FormBanner result={state} hideOk />
          <div className="field">
            <label htmlFor="alert-name">Description</label>
            <input id="alert-name" name="name" placeholder="Name of Alert" required />
          </div>
          <div className="field">
            <label htmlFor="alert-on">Alert On</label>
            <select
              id="alert-on"
              name="trigger_key"
              required
              value={trigger}
              onChange={(event) => setTrigger(event.target.value as AlertTriggerKey | "")}
            >
              <option value="">Select a trigger</option>
              {groups.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.items.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="alert-people-search">Alert People</label>
            <input
              id="alert-people-search"
              type="search"
              placeholder="Search users"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="mt-2 max-h-40 overflow-auto rounded border border-slate-200 px-2 py-1">
              {filteredUsers.length === 0 ? (
                <p className="py-2 text-sm text-slate-400">No users match.</p>
              ) : (
                filteredUsers.map((user) => (
                  <label key={user.id} className="flex items-center gap-2 py-1 text-sm">
                    <input type="checkbox" name="recipient_ids" value={user.id} />
                    {user.name}
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="field">
            <label htmlFor="alert-message">Message</label>
            <textarea
              id="alert-message"
              name="message"
              rows={4}
              placeholder="The alert message contains relevant information from the Alert On field. This field is a good place to give instructions to act on the alert, or leave blank."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn btn-secondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-navy" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Create Alert"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
