import { handleDriverRoster } from "@/lib/driver-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handleDriverRoster();
}
