import Link from "next/link";
import { notFound } from "next/navigation";
import { FleetDocsPanel } from "@/components/fleet-docs-panel";
import { PageHeader } from "@/components/page-header";
import { TrailerForm } from "@/components/trailer-form";
import { UnitComplianceCard } from "@/components/unit-compliance-card";
import { updateTrailerAction } from "@/lib/actions";
import { trailerComplianceAlerts } from "@/lib/compliance";
import { listFleetDocuments } from "@/lib/files";
import { getTrailer } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EditTrailerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const trailer = getTrailer(Number.parseInt((await params).id, 10));
  if (!trailer) notFound();
  const boundAction = updateTrailerAction.bind(null, trailer.id);

  return (
    <>
      <PageHeader
        title={`Trailer ${trailer.unit_number}`}
        actions={
          <Link href="/fleet" className="btn btn-secondary">
            Back to fleet
          </Link>
        }
      />
      <UnitComplianceCard
        title="Registration"
        issued={trailer.registration_issued}
        expires={trailer.registration_expires}
        alerts={trailerComplianceAlerts(trailer)}
        emptyLabel="No registration or DOT dates in the warning windows."
      />
      <TrailerForm trailer={trailer} action={boundAction} submitLabel="Save trailer" />
      <FleetDocsPanel ownerType="trailer" ownerId={trailer.id} documents={listFleetDocuments("trailer", trailer.id)} />
    </>
  );
}
