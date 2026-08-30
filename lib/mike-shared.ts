export type MikeMessage = { role: "user" | "assistant"; content: string };

export type MikeProposalKind =
  | "detention_email"
  | "classify_document"
  | "status_update"
  | "start_ratecon"
  | "build_tie_sheet"
  | "flag_issue"
  | "driver_message";

export type MikeProposal = {
  id: string;
  kind: MikeProposalKind;
  title: string;
  preview: string;
  payload: Record<string, string>;
};

export const MIKE_MISSING_KEY_MESSAGE = "Mike is not connected.";

type ClipboardLike = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{
    kind: string;
    type: string;
    getAsFile?: () => File | null;
  }> | null;
} | null | undefined;

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|gif)$/i.test(file.name);
}

/** Clipboard or drop payload → first image file. Text-only paste returns null. */
export function imageFileFromDataTransfer(data: ClipboardLike): File | null {
  if (!data) return null;
  const files = data.files ? Array.from(data.files) : [];
  const fromFiles = files.find((file) => isImageFile(file));
  if (fromFiles) return fromFiles;
  for (const item of data.items ? Array.from(data.items) : []) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile?.() ?? null;
    if (!file) continue;
    if (isImageFile(file) || item.type.startsWith("image/")) return file;
  }
  return null;
}

function extensionForImageType(type: string): string {
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  if (type.includes("heic")) return "heic";
  if (type.includes("gif")) return "gif";
  return "png";
}

export function namedTieSheetImage(file: File): File {
  const type = file.type.startsWith("image/") ? file.type : "image/png";
  const name =
    file.name?.trim() && /\.(png|jpe?g|webp|heic|gif)$/i.test(file.name)
      ? file.name
      : `tie-sheet.${extensionForImageType(type)}`;
  if (file.name === name && file.type === type) return file;
  return new File([file], name, { type });
}
