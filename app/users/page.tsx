import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { UsersTable } from "@/components/users-table";
import { canManageUsers, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { listDispatcherUsers } from "@/lib/settings";
import { toPublicDispatcher } from "@/lib/settings-shared";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const dispatcher = await getSignedInDispatcher();
  const canManage = dispatcher ? canManageUsers(dispatcher.role) : false;
  const users = listDispatcherUsers(true).map(toPublicDispatcher);
  return (
    <>
      <PageHeader
        title="Users"
        actions={
          canManage ? (
            <Link href="/users/new" className="btn btn-primary">
              Add user
            </Link>
          ) : null
        }
      />
      <UsersTable users={users} canManage={canManage} />
    </>
  );
}
