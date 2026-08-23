import { notFound } from "next/navigation";
import { DispatcherUserForm } from "@/components/dispatcher-user-form";
import { ResetTotpForm } from "@/components/reset-totp-form";
import { PageHeader } from "@/components/page-header";
import { SettingsBack } from "@/components/settings-nav";
import { canManageUsers, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getDispatcherUser } from "@/lib/settings";
import { updateDispatcherUserAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  const user = getDispatcherUser(id);
  if (!user) notFound();
  const dispatcher = await getSignedInDispatcher();
  const canManage = dispatcher ? canManageUsers(dispatcher.role) : false;
  return (
    <>
      <SettingsBack />
      <PageHeader title={user.name} subtitle="Change role, PIN, or deactivate. Keep at least one admin." />
      <section className="card p-6">
        <DispatcherUserForm
          user={user}
          action={updateDispatcherUserAction.bind(null, user.id)}
          submitLabel="Save user"
          canEdit={canManage}
        />
      </section>
      {canManage ? <ResetTotpForm userId={user.id} enrolled={Boolean(user.totp_enrolled)} userName={user.name} /> : null}
    </>
  );
}
