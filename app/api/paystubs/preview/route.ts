import { requireCapability, viewOnlyWriteResponse } from "@/lib/dispatcher-session";
import { filesFromForm, PaystubHttpError, previewPaystubUpload } from "@/lib/paystubs";
import { canUploadPaystubs, VIEW_ONLY_WRITE_MESSAGE } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function denyViewer(): Promise<Response | null> {
  try {
    await requireCapability(canUploadPaystubs, VIEW_ONLY_WRITE_MESSAGE);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign in as a dispatcher to continue.";
    if (/View-only access/.test(message)) return viewOnlyWriteResponse();
    return new Response(message, { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

export async function POST(request: Request) {
  const denied = await denyViewer();
  if (denied) return denied;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Send the PDFs as multipart form data." }, { status: 400 });
  }
  try {
    const { files, summary } = await filesFromForm(form);
    const preview = await previewPaystubUpload({ files, summary });
    return Response.json({ ok: true, ...preview });
  } catch (error) {
    if (error instanceof PaystubHttpError) {
      return Response.json({ ok: false, error: error.message }, { status: error.status });
    }
    return Response.json({ ok: false, error: "Could not read those paystubs." }, { status: 500 });
  }
}
