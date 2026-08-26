import { DispatcherUserForm } from "@/components/dispatcher-user-form";
import { PageHeader } from "@/components/page-header";
import { UsersBack } from "@/components/users-back";
import { canManageUsers, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { createDispatcherUserAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const dispatcher = await getSignedInDispatcher();
  const canManage = dispatcher ? canManageUsers(dispatcher.role) : false;
  return (
    <>
      <UsersBack />
      <PageHeader
        title="Add user"
        subtitle="Add a dispatcher with a PIN."
      />
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
