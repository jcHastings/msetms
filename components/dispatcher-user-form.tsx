"use client";

import { SettingsForm } from "@/components/settings-form";
import { DISPATCHER_PASSWORD_HINT } from "@/lib/dispatcher-password-shared";
import {
  formRoleValue,
  selectableDispatcherRoles,
  type PublicDispatcher,
} from "@/lib/settings-shared";
import type { ActionResult } from "@/lib/types";

export function DispatcherUserForm({
  user,
  action,
  submitLabel,
  canEdit,
}: {
  user?: PublicDispatcher;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  canEdit: boolean;
}) {
  const roles = selectableDispatcherRoles(user?.role);
  return (
    <SettingsForm action={action} submitLabel={submitLabel} canEdit={canEdit}>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={user?.name ?? ""} disabled={!canEdit} />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={user?.email ?? ""} disabled={!canEdit} />
        <p className="mt-1 text-xs text-slate-500">Sign-in codes and password resets go here.</p>
      </div>
      <div className="field">
        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" type="tel" defaultValue={user?.phone ?? ""} disabled={!canEdit} />
        <p className="mt-1 text-xs text-slate-500">
          Used only to text a code when this person changes their password.
        </p>
      </div>
      <div className="field">
        <label htmlFor="password">Password {user ? "(leave blank to keep)" : ""}</label>
        <input
          id="password"
          name="password"
          type="password"
          required={!user}
          defaultValue=""
          autoComplete="new-password"
          disabled={!canEdit}
        />
        <p className="mt-1 text-xs text-slate-500">{DISPATCHER_PASSWORD_HINT}</p>
      </div>
      <div className="field">
        <label htmlFor="role">Role</label>
        <select id="role" name="role" defaultValue={formRoleValue(user?.role)} disabled={!canEdit}>
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="active">Status</label>
        <select id="active" name="active" defaultValue={user && !user.active ? "0" : "1"} disabled={!canEdit}>
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
      </div>
      {user ? (
        <div className="field">
          <label>2-step verification</label>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {user.email?.trim()
              ? "Sign-in emails a code to this user’s email."
              : "Add an email on this user. Sign-in cannot send a code without one."}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {user.has_password
              ? "A password is set. Leave the password field blank to keep it."
              : "No password yet. They must use Forgot password, or set one here."}
          </p>
        </div>
      ) : null}
    </SettingsForm>
  );
}
