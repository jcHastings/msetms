"use client";

import { SettingsForm } from "@/components/settings-form";
import { DISPATCHER_ROLES, PERMISSION_GROUPS, type DispatcherUser } from "@/lib/settings-shared";
import type { ActionResult } from "@/lib/types";

export function DispatcherUserForm({
  user,
  action,
  submitLabel,
  canEdit,
}: {
  user?: DispatcherUser;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  canEdit: boolean;
}) {
  return (
    <SettingsForm action={action} submitLabel={submitLabel} canEdit={canEdit}>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={user?.name ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={user?.email ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="pin">PIN {user ? "(leave blank to keep)" : ""}</label>
        <input id="pin" name="pin" inputMode="numeric" required={!user} defaultValue="" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="role">Role</label>
        <select id="role" name="role" defaultValue={user?.role ?? "dispatcher"}>
          {DISPATCHER_ROLES.filter((role) => role.value !== "manager" || user?.role === "manager").map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="permission_group">Permission group</label>
        <select id="permission_group" name="permission_group" defaultValue={user?.permission_group ?? "all"}>
          {PERMISSION_GROUPS.map((group) => (
            <option key={group.value} value={group.value}>
              {group.label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" value="1" defaultChecked={user ? Boolean(user.active) : true} />
        Active (can sign in)
      </label>
    </SettingsForm>
  );
}
