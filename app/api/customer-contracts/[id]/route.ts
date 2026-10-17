import { readFile } from "node:fs/promises";
import { getSignedInDispatcher, unauthorizedResponse } from "@/lib/dispatcher-session";
import { customerContractPath, getCustomerContract } from "@/lib/customer-contracts";
import { sanitizeName } from "@/lib/files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return unauthorizedResponse();
  const contract = getCustomerContract(Number.parseInt((await params).id, 10));
  if (!contract) return new Response("Not found", { status: 404 });
  try {
    const buffer = await readFile(customerContractPath(contract.storedName));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contract.mimeType || "application/pdf",
        "Content-Disposition": `inline; filename="${sanitizeName(contract.originalName)}"`,
        "Cache-Control": "private, no-transform",
      },
    });
  } catch {
    return new Response("This file is no longer on this computer.", { status: 404 });
  }
}
