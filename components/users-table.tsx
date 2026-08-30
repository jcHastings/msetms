import Link from "next/link";
import { DeleteUserForm } from "@/components/delete-user-form";
import {
  canDeleteDispatcherUser,
  isAdminRole,
  roleLabel,
  type PublicDispatcher,
} from "@/lib/settings-shared";

export function UsersTable({
  users,
  canManage,
  currentUserId,
}: {
  users: PublicDispatcher[];
  canManage: boolean;
  currentUserId?: number | null;
}) {
  return (
    <div className="card" data-users-list="">
      {users.length === 0 ? (
        <p className="p-6 text-sm text-slate-600">
          No users yet.{" "}
          {canManage ? (
            <Link href="/users/new" className="font-semibold underline">
              Add a dispatcher or accounting person
            </Link>
          ) : (
            "Ask an Administrator to add people."
          )}
          .
        </p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {users.map((user) => {
            const otherActiveAdmins = users.filter(
              (row) => row.id !== user.id && row.active && isAdminRole(row.role),
            ).length;
            const deleteGate = canDeleteDispatcherUser({
              targetId: user.id,
              targetRole: user.role,
              targetActive: user.active,
              actorId: currentUserId,
              otherActiveAdmins,
            });
            return (
              <li
                key={user.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                data-user-row=""
              >
                <div className="min-w-0">
                  <Link href={`/users/${user.id}`} className="text-sm font-semibold underline">
                    {user.name}
                  </Link>
                  <div className="text-xs text-slate-500">{user.email || "No email"}{user.phone ? ` · ${user.phone}` : ""}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {roleLabel(user.role)} · {user.active ? "Active" : "Inactive"} ·{" "}
                    {user.email?.trim() ? "Email on file" : "Add an email"}
                    {user.has_password ? "" : " · Set a password"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/users/${user.id}`} className="btn btn-secondary">
                    {canManage ? "Edit" : "View"}
                  </Link>
                  {canManage ? (
                    <DeleteUserForm
                      userId={user.id}
                      userName={user.name}
                      disabled={!deleteGate.ok}
                      disabledReason={deleteGate.ok ? undefined : deleteGate.reason}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
