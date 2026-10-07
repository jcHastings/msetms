import { readFile } from "node:fs/promises";
import { companyLogoPath, getCompanySettings, hasCustomCompanyLogo, readDefaultCompanyLogo } from "@/lib/settings";

export const dynamic = "force-dynamic";

function imageResponse(buffer: Buffer, contentType: string): Response {
  const type = contentType.startsWith("image/") ? contentType : "image/png";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  const settings = getCompanySettings();
  if (hasCustomCompanyLogo(settings)) {
    const file = companyLogoPath(settings);
    if (!file) return new Response("Not found", { status: 404 });
    try {
      const buffer = await readFile(file);
      if (buffer.length > 0) return imageResponse(buffer, settings.logo_mime_type || "image/png");
    } catch {
      return new Response("Not found", { status: 404 });
    }
    return new Response("Not found", { status: 404 });
  }
  return imageResponse(readDefaultCompanyLogo(), "image/png");
}
