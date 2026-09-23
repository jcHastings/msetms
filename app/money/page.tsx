import { AccessDenied } from "@/components/access-denied";
import { MoneyDeskView } from "@/components/money-desk-view";
import { deskMetadata } from "@/lib/desk-metadata";
import { getPageAccess } from "@/lib/dispatcher-session";
import { loadMoneyDesk } from "@/lib/money-desk-store";
import { canViewMoney } from "@/lib/settings-shared";

export const metadata = deskMetadata("Money");
export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{
    span?: string | string[];
    week?: string | string[];
    month?: string | string[];
    quarter?: string | string[];
    inactive?: string | string[];
    q?: string | string[];
  }>;
}) {
  const dispatcher = await getPageAccess(canViewMoney);
  if (!dispatcher) {
    return (
      <main id="main" className="money-desk">
        <AccessDenied message="Money is for the office." />
      </main>
    );
  }
  const params = await searchParams;
  return (
    <MoneyDeskView
      model={loadMoneyDesk({
        span: firstParam(params.span),
        week: firstParam(params.week),
        month: firstParam(params.month),
        quarter: firstParam(params.quarter),
        inactive: firstParam(params.inactive),
        q: firstParam(params.q),
      })}
    />
  );
}
