import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SettingsBack } from "@/components/settings-nav";
import { canManageUsers, getSignedInDispatcher, roleLabel } from "@/lib/dispatcher-session";
import { listDispatcherUsers, permissionGroupLabel } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const canManage = dispatcher ? canManageUsers(dispatcher.role) : false;
  const users = listDispatcherUsers(true);
  return (
    <>
      <SettingsBack />
      <PageHeader
        title="Dispatchers and roles"
        subtitle="Local PIN users. Admin and manager can add people. Read-only can view but not save settings. No invite email is sent."
        actions={
          canManage ? (
            <Link href="/settings/users/new" className="btn btn-primary">
              Add user
            </Link>
          ) : null
        }
      />
      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Group</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="font-semibold">{user.name}</div>
                  <div className="text-xs text-slate-500">{user.email || "No email"}</div>
                </td>
                <td>{roleLabel(user.role)}</td>
                <td>{permissionGroupLabel(user.permission_group)}</td>
                <td>{user.active ? "Yes" : "Off"}</td>
                <td className="text-right">
                  <Link href={`/settings/users/${user.id}`} className="text-sm font-semibold underline">
                    {canManage ? "Edit" : "View"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
