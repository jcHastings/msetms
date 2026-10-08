"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DriverPhotoFields } from "@/components/driver-photo-fields";
import { driverUploadAction } from "@/lib/driver-actions";
import { DRIVER_UPLOAD_KINDS } from "@/lib/driver-docs";
import { imagesToPdf, pdfFileName } from "@/lib/image-pdf";
import { prepareDriverPhoto } from "@/lib/prepare-driver-photo";

type Draft = { previewUrl: string; blob: Blob };
type Page = Draft & { id: string };

export function DriverUpload({
  loadId,
  loadNumber,
  lockedKind,
  title = "Upload",
  intro = "Pick the document type, then take a photo or choose from photos.",
  onUploaded,
}: {
  loadId: number;
  loadNumber: string;
  /** When set, the document type is fixed and the picker is hidden. */
  lockedKind?: string;
  title?: string;
  intro?: string;
  onUploaded?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const kindFieldId = `driver-upload-kind-${useId().replace(/:/g, "")}`;
  const [kind, setKind] = useState(lockedKind ?? "");
  const [gallons, setGallons] = useState("");
  const [state, setState] = useState("");
  const [station, setStation] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftUrl = useRef<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (lockedKind) return;
    const apply = () => {
      if (window.location.hash === "#fuel") setKind("fuel_receipt");
    };
    const frame = window.requestAnimationFrame(apply);
    window.addEventListener("hashchange", apply);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", apply);
    };
  }, [lockedKind]);

  useEffect(() => {
    return () => {
      if (draftUrl.current) URL.revokeObjectURL(draftUrl.current);
    };
  }, []);

  function setDraftFromBlob(blob: Blob) {
    if (draftUrl.current) URL.revokeObjectURL(draftUrl.current);
    const previewUrl = URL.createObjectURL(blob);
    draftUrl.current = previewUrl;
    setDraft({ blob, previewUrl });
    setSaved(null);
  }

  function requireKind(): string | null {
    if (lockedKind) return lockedKind;
    if (!kind) {
      setError("Pick what kind of document this is.");
      return null;
    }
    return kind;
  }

  function isPdfFile(file: File): boolean {
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  }

  async function uploadFile(file: File, nextKind: string) {
    const form = new FormData();
    form.set("file", file);
    form.set("load_id", String(loadId));
    form.set("kind", nextKind);
    if (nextKind === "fuel_receipt") {
      if (gallons) form.set("gallons", gallons);
      if (state) form.set("state", state);
      if (station) form.set("station", station);
    }
    const result = await driverUploadAction(form);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setSaved("Saved on this load.");
    router.refresh();
    await onUploaded?.();
    return true;
  }

  function onFilePicked(file: File) {
    setSaved(null);
    if (isPdfFile(file)) {
      const nextKind = requireKind();
      if (!nextKind) {
        setError("Pick what kind of document this is, then choose the PDF again.");
        return;
      }
      setPending(true);
      setError(null);
      void uploadFile(file, nextKind).finally(() => setPending(false));
      return;
    }
    setDraftFromBlob(file);
    if (!lockedKind && !kind) {
      setError("Pick what kind of document this is before you save this photo.");
      return;
    }
    setError(null);
  }

  function usePhoto() {
    if (!draft) return;
    const nextKind = requireKind();
    if (!nextKind) return;
    const snapshot = draft;
    draftUrl.current = null;
    setDraft(null);
    setPages((current) => [...current, { ...snapshot, id: crypto.randomUUID() }]);
    setError(null);
  }

  function removePage(id: string) {
    setPages((current) => {
      const next = current.filter((page) => page.id !== id);
      const removed = current.find((page) => page.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  async function makePdfAndUpload() {
    const nextKind = requireKind();
    if (!nextKind) return;
    if (pages.length === 0) {
      setError("Take or choose at least one photo.");
      return;
    }
    setPending(true);
    setError(null);
    setSaved(null);
    try {
      const images = await Promise.all(
        pages.map(async (page) => ({
          bytes: await prepareDriverPhoto(page.blob),
          format: "jpeg" as const,
        })),
      );
      const pdfBytes = await imagesToPdf(images);
      const copy = new Uint8Array(pdfBytes);
      const file = new File([copy], pdfFileName(nextKind, loadNumber), { type: "application/pdf" });
      const ok = await uploadFile(file, nextKind);
      if (ok) {
        for (const page of pages) URL.revokeObjectURL(page.previewUrl);
        setPages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make the PDF.");
    } finally {
      setPending(false);
    }
  }

  const fuel = (lockedKind ?? kind) === "fuel_receipt";
  const cameraLabel = draft ? "Retake" : pages.length > 0 ? "Add another page" : lockedKind === "pod" ? "Take POD photo" : "Take photo";

  return (
    <section className="rounded-2xl bg-slate-900 p-4 shadow-sm ring-1 ring-white/10" data-driver-upload="">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{intro}</p>

      {lockedKind ? null : (
        <div className="mt-3 field">
          <label htmlFor={kindFieldId} className="text-slate-300">
            Document type
          </label>
          <select
            id={kindFieldId}
            name="kind"
            required
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setError(null);
              setSaved(null);
            }}
            className="min-h-12 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-white"
          >
            <option value="">What is this?</option>
            {DRIVER_UPLOAD_KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {fuel ? (
        <div className="mt-3 space-y-3" data-fuel-extras="">
          <div className="grid grid-cols-2 gap-2">
            <div className="field">
              <label htmlFor={`${kindFieldId}-gallons`} className="text-slate-300">
                Gallons
              </label>
              <input
                id={`${kindFieldId}-gallons`}
                name="gallons"
                type="number"
                step="0.1"
                value={gallons}
                onChange={(event) => setGallons(event.target.value)}
                className="min-h-12 text-white"
              />
            </div>
            <div className="field">
              <label htmlFor={`${kindFieldId}-state`} className="text-slate-300">
                State
              </label>
              <input
                id={`${kindFieldId}-state`}
                name="state"
                maxLength={2}
                value={state}
                onChange={(event) => setState(event.target.value)}
                className="min-h-12 text-white"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${kindFieldId}-station`} className="text-slate-300">
              Station
            </label>
            <input
              id={`${kindFieldId}-station`}
              name="station"
              value={station}
              onChange={(event) => setStation(event.target.value)}
              className="min-h-12 text-white"
            />
          </div>
        </div>
      ) : null}

      {draft ? (
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={draft.previewUrl} alt="Photo preview" className="max-h-80 w-full rounded-2xl bg-slate-100 object-contain" />
          <button
            type="button"
            className="driver-photo-trigger driver-photo-trigger-primary mt-3"
            onClick={usePhoto}
          >
            Use photo
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        <DriverPhotoFields
          entry={lockedKind === "pod" ? "pod-delivery" : "load-document"}
          tone="dark"
          cameraLabel={cameraLabel}
          cameraEmphasis={draft ? "secondary" : "primary"}
          onPick={onFilePicked}
          disabled={pending}
        />
      </div>

      {pages.length > 0 ? (
        <div className="mt-4">
          <div className="text-sm font-semibold text-white">
            {pages.length} page{pages.length === 1 ? "" : "s"}
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {pages.map((page, index) => (
              <div key={page.id} className="flex w-24 shrink-0 flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.previewUrl}
                  alt={`Page ${index + 1}`}
                  className="h-24 w-24 rounded-lg object-cover ring-1 ring-slate-200"
                />
                <button
                  type="button"
                  className="min-h-11 rounded-lg bg-slate-800 text-sm font-semibold text-white"
                  onClick={() => removePage(page.id)}
                  aria-label={`Remove page ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary mt-3 min-h-14 w-full text-lg"
            onClick={() => void makePdfAndUpload()}
            disabled={pending}
          >
            {pending ? "Making PDF…" : "Make PDF and upload"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-rose-200" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="mt-3 text-sm text-emerald-300" role="status">
          {saved}
        </p>
      ) : null}
    </section>
  );
}
