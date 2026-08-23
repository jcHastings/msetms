import { AppShell } from "@/components/app-shell";
import { requireDispatcherPage } from "@/lib/dispatch-auth";

export default async function DispatchLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDispatcherPage();
  return <AppShell username={user.username}>{children}</AppShell>;
}
