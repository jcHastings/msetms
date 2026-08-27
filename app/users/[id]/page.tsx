import { notFound } from "next/navigation";
import { DispatcherUserForm } from "@/components/dispatcher-user-form";
import { PageHeader } from "@/components/page-header";
import { ResetTotpForm } from "@/components/reset-totp-form";
import { UsersBack } from "@/components/users-back";
import { canManageUsers, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getDispatcherUser } from "@/lib/settings";
import { updateDispatcherUserAction } from "@/lib/settings-actions";
import { toPublicDispatcher } from "@/lib/settings-shared";

export const dynamic = "force-dynamic";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const user = getDispatcherUser(id);
  if (!user) notFound();
  const dispatcher = await getSignedInDispatcher();
  const canManage = dispatcher ? canManageUsers(dispatcher.role) : false;
  const publicUser = toPublicDispatcher(user);
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
    </>
  );
}
