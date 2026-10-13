import { CompanyDocSlotCard, type CompanyDocRow, type UnitOption } from "@/components/company-docs-panel";
import { ComplianceHubTabs } from "@/components/compliance-hub-tabs";
import { PageHeader } from "@/components/page-header";
import { daysUntil } from "@/lib/compliance";
import { companyDocDisplayName, listCompanyDocHistory, type CompanyDocWithUnit } from "@/lib/company-docs";
import { retireCompanyDocAction, uploadCompanyDocAction } from "@/lib/company-docs-actions";
import { COMPANY_DOC_DIVISION, COMPANY_DOC_SLOTS, COMPANY_DOC_WARN_DAYS } from "@/lib/company-docs-shared";
import { deskMetadata } from "@/lib/desk-metadata";
import { canViewFleet, getPageAccess } from "@/lib/dispatcher-session";
import { formatDate } from "@/lib/format";
import { listTrailers, listTrucks } from "@/lib/queries";
import { canEditFleet } from "@/lib/settings-shared";

export const metadata = deskMetadata("Company docs");
export const dynamic = "force-dynamic";

function dateLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return formatDate(trimmed.length === 10 ? `${trimmed}T12:00:00` : trimmed);
}

function toRow(doc: CompanyDocWithUnit): CompanyDocRow {
  const days = daysUntil(doc.expires_on);
  const tone: CompanyDocRow["tone"] =
    days == null ? "ok" : days < 0 ? "expired" : days <= COMPANY_DOC_WARN_DAYS ? "expiring" : "ok";
  const toneLabel =
    days == null ? "No date" : days < 0 ? "Expired" : days <= COMPANY_DOC_WARN_DAYS ? `${days} day${days === 1 ? "" : "s"} left` : "OK";
  return {
    id: doc.id,
    label: companyDocDisplayName(doc),
    originalName: doc.original_name,
    expiresOn: doc.expires_on,
    expiresLabel: dateLabel(doc.expires_on) || "—",
    tone,
    toneLabel,
    status: doc.status,
    uploadedBy: doc.uploaded_by,
    createdLabel: dateLabel(doc.created_at),
    endedLabel: dateLabel(doc.ended_at),
  };
}

export default async function CompanyDocsPage() {
  const dispatcher = await getPageAccess(canViewFleet);
  const canEdit = canEditFleet(dispatcher.role);
  const units: UnitOption[] = [
    ...listTrucks()
      .filter((truck) => String(truck.division ?? "MSE").toUpperCase() === COMPANY_DOC_DIVISION && truck.active !== 0)
      .map((truck) => ({ value: `truck:${truck.id}`, label: `Truck ${truck.unit_number}` })),
    ...listTrailers()
      .filter((trailer) => String(trailer.division ?? "MSE").toUpperCase() === COMPANY_DOC_DIVISION && trailer.active !== 0)
      .map((trailer) => ({ value: `trailer:${trailer.id}`, label: `Trailer ${trailer.unit_number}` })),
  ];
  return (
    <>
      <PageHeader title="Company docs" />
      <ComplianceHubTabs tab="company" />
      <div className="space-y-5">
        {COMPANY_DOC_SLOTS.map((slot) => {
          const history = listCompanyDocHistory(slot.value);
          return (
            <CompanyDocSlotCard
              key={slot.value}
              slot={slot}
              current={history.filter((doc) => doc.status === "current").map(toRow)}
              history={history.filter((doc) => doc.status !== "current").map(toRow)}
              units={units}
              canEdit={canEdit}
              uploadAction={uploadCompanyDocAction}
              retireAction={retireCompanyDocAction}
            />
          );
        })}
      </div>
    </>
  );
}
