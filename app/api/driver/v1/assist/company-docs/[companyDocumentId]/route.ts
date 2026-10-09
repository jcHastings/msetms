import { handleDriverAssistCompanyDocument } from "@/lib/driver-assist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ companyDocumentId: string }> }) {
  return handleDriverAssistCompanyDocument(request, context.params);
}
