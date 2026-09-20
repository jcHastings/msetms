import { notFound, redirect } from "next/navigation";
import { LoadEditor } from "@/components/load-editor";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { parseLoadTab } from "@/lib/load-tabs";
import { safeReturnTo } from "@/lib/load-page-shared";
import { getLoad } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LoadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; from?: string; embed?: string }>;
}) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) redirect("/login");
  const { id } = await params;
  const { tab, from, embed } = await searchParams;
  const load = getLoad(Number.parseInt(id, 10));
  if (!load) notFound();
  return (
    <div data-load-embed={embed === "1" ? "" : undefined}>
      <LoadEditor loadId={load.id} returnTo={safeReturnTo(from, "/board")} initialTab={parseLoadTab(tab)} />
    </div>
  );
}
