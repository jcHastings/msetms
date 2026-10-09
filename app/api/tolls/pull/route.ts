import { requireCapability } from "@/lib/dispatcher-session";
import { canUploadFuel } from "@/lib/settings-shared";
import { pullPrepassTollTransactions } from "@/lib/tolls-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireCapability(canUploadFuel, "Tolls is for Administrator and Standard.");
    const result = await pullPrepassTollTransactions();
    return Response.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return Response.json(
      { ok: false, error: message },
      { status: message.startsWith("View-only access") ? 403 : 401 },
    );
  }
}
