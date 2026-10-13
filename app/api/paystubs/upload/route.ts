import {
  PaystubHttpError,
  authorizePaystubUploadToken,
  bearerToken,
  filesFromForm,
  ingestUploadedPaystubs,
  parsePaystubOverrides,
  paystubUploadToken,
  shorthandOverride,
} from "@/lib/paystubs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = authorizePaystubUploadToken(paystubUploadToken(), bearerToken(request.headers.get("authorization")));
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Send the PDFs as multipart form data." }, { status: 400 });
  }
  try {
    const { files, summary } = await filesFromForm(form);
    const overrides = parsePaystubOverrides(String(form.get("overrides") ?? ""));
    const result = await ingestUploadedPaystubs({
      files,
      summary,
      overrides,
      shorthand: shorthandOverride(form),
      uploadedBy: "upload-token",
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof PaystubHttpError) {
      return Response.json({ ok: false, error: error.message }, { status: error.status });
    }
    return Response.json({ ok: false, error: "Paystub upload failed." }, { status: 500 });
  }
}
