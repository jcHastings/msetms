/** Native camera / gallery pick helpers. Safe to import from client components and tests. */

export const CAMERA_ACCEPT = "image/*";
export const GALLERY_ACCEPT = "image/*,application/pdf";
export const CAMERA_CAPTURE = "environment" as const;

export const EMPTY_CAMERA_MESSAGE =
  "No photo came back. Tap Take photo again, or use Choose from photos.";
export const EMPTY_GALLERY_MESSAGE = "No file came back. Tap Choose from photos again.";
export const EMPTY_FILE_MESSAGE = "That file was empty. Choose another photo.";
export const EMPTY_PICK_SETTLE_MS = 700;

export type PhotoPickSource = "camera" | "gallery";

type ListedFile = { size: number };

export type FileInputLike = {
  value: string;
  files: { length: number; [index: number]: ListedFile | undefined } | null;
};

/**
 * Read the chosen file, then clear the input so the same file can fire change again.
 * The returned File object stays valid after the input is cleared.
 */
export function readAndResetFileInput<T extends ListedFile>(input: {
  value: string;
  files: { length: number; [index: number]: T | undefined } | null;
}): { file: T | null; empty: boolean } {
  const file = input.files && input.files.length > 0 ? (input.files[0] ?? null) : null;
  input.value = "";
  if (!file) return { file: null, empty: false };
  if (file.size <= 0) return { file: null, empty: true };
  return { file, empty: false };
}

export function emptyPickMessage(source: PhotoPickSource, emptyFile: boolean): string {
  if (emptyFile) return EMPTY_FILE_MESSAGE;
  return source === "camera" ? EMPTY_CAMERA_MESSAGE : EMPTY_GALLERY_MESSAGE;
}

export function handlePhotoInputChange<T extends ListedFile>(
  input: { value: string; files: { length: number; [index: number]: T | undefined } | null },
  source: PhotoPickSource,
): { file: T | null; message: string | null } {
  const { file, empty } = readAndResetFileInput(input);
  if (file) return { file, message: null };
  return { file: null, message: emptyPickMessage(source, empty) };
}

/** True only after the picker was left and no file arrived. */
export function shouldSignalEmptyPick(state: { left: boolean; picked: boolean }): boolean {
  return state.left && !state.picked;
}

export function parkFileForSubmit(holder: HTMLInputElement, file: File): boolean {
  if (typeof DataTransfer === "undefined") return false;
  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    holder.files = transfer.files;
    const parked = holder.files?.[0];
    return Boolean(parked && parked.size > 0 && parked.name === file.name);
  } catch {
    return false;
  }
}
