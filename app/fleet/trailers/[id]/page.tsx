import Link from "next/link";
import { notFound } from "next/navigation";
import { FleetDocsPanel } from "@/components/fleet-docs-panel";
import { PageHeader } from "@/components/page-header";
import { TrailerForm } from "@/components/trailer-form";
import { UnitComplianceCard } from "@/components/unit-compliance-card";
import { trailerComplianceAlerts } from "@/lib/compliance";
import { listFleetDocuments } from "@/lib/files";
import { trailerFormValues, truckOption } from "@/lib/fleet-form-shared";
import { getTrailer, listTrucks } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function EditTrailerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const trailer = getTrailer(Number.parseInt((await params).id, 10));
  if (!trailer) notFound();

  return (
    <>
      <PageHeader
        title={`Trailer ${trailer.unit_number}`}
        actions={
          <Link href="/fleet/trailers" className="btn btn-secondary">
            Back to trailers
          </Link>
        }
      />
      <UnitComplianceCard
        registrationIssued={trailer.registration_issued}
        registrationExpires={trailer.registration_expires}
        inspectedOn={trailer.dot_inspected_on}
        inspectionExpires={trailer.dot_expires}
        alerts={trailerComplianceAlerts(trailer, complianceWindows())}
      />
      <TrailerForm
        trailer={trailerFormValues(trailer)}
        trucks={listTrucks().map(truckOption)}
        submitLabel="Save trailer"
      />
      <FleetDocsPanel
        ownerType="trailer"
        ownerId={Number(trailer.id)}
        documents={listFleetDocuments("trailer", trailer.id)}
      />
    </>
  );
}
