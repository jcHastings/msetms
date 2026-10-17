import { notFound } from "next/navigation";
import { DeleteUserForm } from "@/components/delete-user-form";
import { DispatcherUserForm } from "@/components/dispatcher-user-form";
import { PageHeader } from "@/components/page-header";
import { ResetTotpForm } from "@/components/reset-totp-form";
import { UsersBack } from "@/components/users-back";
import { canManageUsers, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getDispatcherUser, listDispatcherUsers } from "@/lib/settings";
import { updateDispatcherUserAction } from "@/lib/settings-actions";
import { canDeleteDispatcherUser, isAdminRole, toPublicDispatcher } from "@/lib/settings-shared";

export const dynamic = "force-dynamic";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const user = getDispatcherUser(id);
  if (!user) notFound();
  const dispatcher = await getSignedInDispatcher();
  const canManage = dispatcher ? canManageUsers(dispatcher.role) : false;
  const publicUser = toPublicDispatcher(user);
  const otherActiveAdmins = listDispatcherUsers(true).filter(
    (row) => row.id !== user.id && row.active && isAdminRole(row.role),
  ).length;
  const deleteGate = canDeleteDispatcherUser({
    targetId: user.id,
    targetRole: user.role,
    targetActive: user.active,
    actorId: dispatcher?.id,
    otherActiveAdmins,
  });
  return (
    <>
      <UsersBack />
      <PageHeader
        title={user.name}
      />
      <section className="card p-6">
        <DispatcherUserForm
          user={publicUser}
          action={updateDispatcherUserAction.bind(null, user.id)}
          submitLabel="Save user"
          canEdit={canManage}
        />
      </section>
      {canManage ? (
        <ResetTotpForm userId={user.id} enrolled={Boolean(user.totp_enrolled)} userName={user.name} />
      ) : null}
      {canManage ? (
        <section className="card mt-4 p-6">
          <h2 className="text-sm font-semibold">Delete user</h2>
          <p className="mt-1 text-sm text-slate-600">Removes this login. Loads they dispatched stay; the dispatcher field clears.</p>
          <div className="mt-3">
            <DeleteUserForm
              userId={user.id}
              userName={user.name}
              disabled={!deleteGate.ok}
              disabledReason={deleteGate.ok ? undefined : deleteGate.reason}
            />
          </div>
        </section>
      ) : null}
    </>
  );
}
