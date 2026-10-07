import { getSignedInDriver } from "@/lib/driver-session";
import { getGustoPublicStatus, listGustoPayLinesForDriver } from "@/lib/integrations/gusto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const driver = await getSignedInDriver();
  if (!driver) {
    return Response.json({ ok: false, error: "Sign in with your email and password." }, { status: 401 });
  }
  const requested = new URL(request.url).searchParams.get("driverId");
  if (requested && Number(requested) !== driver.id) {
    return Response.json({ ok: false, error: "You can only open your own paystubs." }, { status: 403 });
  }
  const status = getGustoPublicStatus();
  const paystubs = listGustoPayLinesForDriver(driver.id).map((row) => ({
    id: row.id,
    checkDate: row.check_date,
    payPeriodStart: row.pay_period_start,
    payPeriodEnd: row.pay_period_end,
    grossPay: row.gross_pay,
    netPay: row.net_pay,
    source: row.source,
  }));
  return Response.json({
    ok: true,
    connected: status.connected,
    paystubs,
  });
}
