import { readFile } from "node:fs/promises";
import { companyLogoPath, getCompanySettings } from "@/lib/settings";

export async function GET() {
  const settings = getCompanySettings();
  const file = companyLogoPath(settings);
  if (!file) {
    return new Response("Not found", { status: 404 });
  }
  const buffer = await readFile(file);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": settings.logo_mime_type || "image/png",
      "Cache-Control": "no-store",
    },
  });
}
