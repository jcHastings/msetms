import { authorizeFuelImport, fuelImportUploadFile } from "@/lib/fuel-import-http";
import { importFuelFromUpload } from "@/lib/fuel-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authorizeFuelImport(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Choose a CSV, Excel, or PDF." }, { status: 409 });
  }
  const file = fuelImportUploadFile(form);
  if (!file) {
    return Response.json({ ok: false, error: "Choose a CSV, Excel, or PDF." }, { status: 409 });
  }
  const result = await importFuelFromUpload(file);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
