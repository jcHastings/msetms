import Link from "next/link";
import { roleLabel, type PublicDispatcher } from "@/lib/settings-shared";

export function UsersTable({
  users,
  canManage,
}: {
  users: PublicDispatcher[];
  canManage: boolean;
}) {
  return (
    <div className="card overflow-hidden">
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
        <table className="table-grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Active</th>
              <th>2-step</th>
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
                <td>{user.active ? "Active" : "Inactive"}</td>
                <td>{user.totp_enrolled ? "On" : "Off"}</td>
                <td className="text-right">
                  <Link href={`/users/${user.id}`} className="text-sm font-semibold underline">
                    {canManage ? "Edit" : "View"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
