import { handleDriverLogin } from "@/lib/driver-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleDriverLogin(request);
}
