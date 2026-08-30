export const MIKE_PICTURE_MAX_BYTES = 8 * 1024 * 1024;

export type MikePictureInput = {
  mime: string;
  name: string;
  base64: string;
  text: string;
};

export function isMikePictureName(mime = "", filename = ""): boolean {
  const type = mime.toLowerCase();
  if (type.startsWith("image/")) return !type.includes("svg");
  return /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(filename);
}

export function imageFileFromClipboard(data: {
  items?: ArrayLike<{ type?: string; getAsFile?: () => File | null }>;
  files?: ArrayLike<File>;
} | null): File | null {
  if (!data) return null;
  const items = data.items ? Array.from(data.items) : [];
  for (const item of items) {
    if (!String(item.type || "").toLowerCase().startsWith("image/")) continue;
    const file = item.getAsFile?.() ?? null;
    if (file && isMikePictureName(file.type, file.name)) return file;
  }
  const files = data.files ? Array.from(data.files) : [];
  return files.find((file) => isMikePictureName(file.type, file.name)) ?? null;
}

export function mikeHistoryLine(question: string, hasPicture: boolean): string {
  const asked = question.trim();
  if (hasPicture && asked) return `Pasted a picture. ${asked}`.slice(0, 2000);
  if (hasPicture) return "Pasted a picture.";
  return asked.slice(0, 2000);
}

export function mikePicturePrompt(question: string, picture: MikePictureInput | null): string {
  const asked = question.trim() || (picture ? "Read this picture." : "");
  if (!picture) return asked.slice(0, 2000);
  const ocr = picture.text.trim();
  return [
    asked,
    "A picture is attached. Read the visible text. Do not invent values you cannot see.",
    ocr ? `Read from the picture:\n${ocr.slice(0, 4000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);
}
