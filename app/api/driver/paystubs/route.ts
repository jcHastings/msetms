import { getSignedInDriver } from "@/lib/driver-session";
import { listDriverPaystubs } from "@/lib/paystubs";

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
  const paystubs = listDriverPaystubs(driver.id).map((row) => ({
    id: row.id,
    payDate: row.pay_date,
    payPeriodStart: row.period_start,
    payPeriodEnd: row.period_end,
    grossPay: row.gross,
    netPay: row.net,
    fileName: row.original_name,
  }));
  return Response.json({ ok: true, paystubs });
}
