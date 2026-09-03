import Link from "next/link";
import { ExceptionInboxCard } from "@/components/exception-inbox";
import { PageHeader } from "@/components/page-header";
import { LoadOverlay } from "@/components/load-overlay";
import { PageOverlayHost } from "@/components/page-overlay-host";
import { listWorkbenchInbox } from "@/lib/desk";
import { overlayReturnTo, parseOpenLoadId } from "@/lib/load-page-shared";

export const dynamic = "force-dynamic";

export default async function WorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string; open?: string }>;
}) {
  const params = await searchParams;
  const openId = parseOpenLoadId(params.open);
  const current = { kind: params.kind, q: params.q };
  const inbox = listWorkbenchInbox({ kind: params.kind, q: params.q });

  return (
    <PageOverlayHost returnTo={overlayReturnTo("/", current)} serverOpenId={openId}>
      <PageHeader
        title="Workbench"
        actions={
          <Link href="/board" className="btn btn-secondary" data-workbench-board="">
            Dispatch board
          </Link>
        }
      />
      <ExceptionInboxCard inbox={inbox} kind={params.kind} q={params.q} variant="workbench" />
      {openId ? <LoadOverlay loadId={openId} returnTo={overlayReturnTo("/", current)} /> : null}
    </PageOverlayHost>
  );
}
