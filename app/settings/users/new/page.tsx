import { DispatcherUserForm } from "@/components/dispatcher-user-form";
import { PageHeader } from "@/components/page-header";
import { SettingsBack } from "@/components/settings-nav";
import { canManageUsers, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { createDispatcherUserAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const dispatcher = await getSignedInDispatcher();
  const canManage = dispatcher ? canManageUsers(dispatcher.role) : false;
  return (
    <>
      <SettingsBack />
      <PageHeader title="Add dispatcher" subtitle="PIN login only. Do not store secrets here." />
      <section className="card p-6">
        <DispatcherUserForm
          action={createDispatcherUserAction}
          submitLabel="Add user"
          canEdit={canManage}
        />
      </section>
    </>
  );
}
