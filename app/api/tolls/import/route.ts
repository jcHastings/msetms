import { importTollsFromUpload } from "@/lib/toll-import";
import { authorizeTollsImport, tollsImportUploadFile } from "@/lib/tolls-import-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authorizeTollsImport();
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Choose a CSV or Excel file." }, { status: 409 });
  }
  const file = tollsImportUploadFile(form);
  if (!file) {
    return Response.json({ ok: false, error: "Choose a CSV or Excel file." }, { status: 409 });
  }
  const result = await importTollsFromUpload(file);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
