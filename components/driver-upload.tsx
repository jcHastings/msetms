"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { driverUploadAction } from "@/lib/driver-actions";
import { DRIVER_UPLOAD_KINDS } from "@/lib/driver-docs";
import { imagesToPdf, pdfFileName } from "@/lib/image-pdf";

type Draft = { previewUrl: string; blob: Blob };
type Page = Draft & { id: string };

export function DriverUpload({
  loadId,
  loadNumber,
}: {
  loadId: number;
  loadNumber: string;
}) {
  const router = useRouter();
  const captureRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [kind, setKind] = useState("");
  const [gallons, setGallons] = useState("");
  const [state, setState] = useState("");
  const [station, setStation] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [live, setLive] = useState<MediaStream | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#fuel") setKind("fuel_receipt");
  }, []);

  useEffect(() => {
    return () => {
      live?.getTracks().forEach((track) => track.stop());
    };
  }, [live]);

  function stopLive() {
    live?.getTracks().forEach((track) => track.stop());
    setLive(null);
  }

  function setDraftFromBlob(blob: Blob) {
    setDraft({ blob, previewUrl: URL.createObjectURL(blob) });
    setError(null);
    setSaved(null);
  }

  function requireKind(): string | null {
    if (!kind) {
      setError("Pick what kind of document this is.");
      return null;
    }
    return kind;
  }

  function isPdfFile(file: File): boolean {
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  }

  async function onFilePicked(file: File | undefined) {
    if (!file) return;
    const nextKind = requireKind();
    if (!nextKind) return;
    if (isPdfFile(file)) {
      setPending(true);
      setError(null);
      setSaved(null);
      try {
        await uploadFile(file, nextKind);
      } finally {
        setPending(false);
      }
      return;
    }
    setDraftFromBlob(file);
  }

  async function takePhoto() {
    if (!requireKind()) return;
    setError(null);
    setSaved(null);
    if (typeof window !== "undefined" && window.isSecureContext && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        setLive(stream);
        requestAnimationFrame(() => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        });
        return;
      } catch {
        // HTTP LAN / permission: native camera input is the reliable path
      }
    }
    captureRef.current?.click();
  }

  async function snapLive() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    stopLive();
    if (blob) setDraftFromBlob(blob);
  }

  function retake() {
    if (draft) URL.revokeObjectURL(draft.previewUrl);
    setDraft(null);
    void takePhoto();
  }

  function usePhoto() {
    if (!draft) return;
    setPages((current) => [...current, { ...draft, id: crypto.randomUUID() }]);
    setDraft(null);
  }

  function removePage(id: string) {
    setPages((current) => {
      const next = current.filter((page) => page.id !== id);
      const removed = current.find((page) => page.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  function autoCropAndGrayscale(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = source;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
        if (gray < 236) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    ctx.putImageData(source, 0, 0);
    const pad = 8;
    if (maxX > minX + 20 && maxY > minY + 20) {
      const sx = Math.max(0, minX - pad);
      const sy = Math.max(0, minY - pad);
      const sw = Math.min(width - sx, maxX - minX + pad * 2);
      const sh = Math.min(height - sy, maxY - minY + pad * 2);
      const cropped = ctx.getImageData(sx, sy, sw, sh);
      canvas.width = sw;
      canvas.height = sh;
      ctx.putImageData(cropped, 0, 0);
    }
  }

  async function blobToJpeg(blob: Blob): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(blob);
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the photo.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    autoCropAndGrayscale(ctx, canvas);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!jpeg) throw new Error("Could not convert the photo.");
    return new Uint8Array(await jpeg.arrayBuffer());
  }

  function appendExtras(form: FormData, nextKind: string) {
    form.set("load_id", String(loadId));
    form.set("kind", nextKind);
    if (nextKind === "fuel_receipt") {
      if (gallons) form.set("gallons", gallons);
      if (state) form.set("state", state);
      if (station) form.set("station", station);
    }
  }

  async function uploadFile(file: File, nextKind: string) {
    const form = new FormData();
    form.set("file", file);
    appendExtras(form, nextKind);
    const result = await driverUploadAction(form);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setSaved("Saved on this load.");
    router.refresh();
    return true;
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
          bytes: await blobToJpeg(page.blob),
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

  const fuel = kind === "fuel_receipt";

  return (
    <section className="rounded-2xl bg-slate-900 p-4 shadow-sm ring-1 ring-white/10" data-driver-upload="">
      <h2 className="text-base font-semibold text-white">Upload</h2>
      <p className="mt-1 text-sm text-slate-400">
        Pick the document type, then take a photo or choose a file.
      </p>

      <div className="mt-3 field">
        <label htmlFor="driver-upload-kind" className="text-slate-300">
          Document type
        </label>
        <select
          id="driver-upload-kind"
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

      {fuel ? (
        <div className="mt-3 space-y-3" data-fuel-extras="">
          <div className="grid grid-cols-2 gap-2">
            <div className="field">
              <label htmlFor="fuel-gallons" className="text-slate-300">
                Gallons
              </label>
              <input
                id="fuel-gallons"
                name="gallons"
                type="number"
                step="0.1"
                value={gallons}
                onChange={(event) => setGallons(event.target.value)}
                className="min-h-12 text-white"
              />
            </div>
            <div className="field">
              <label htmlFor="fuel-state" className="text-slate-300">
                State
              </label>
              <input
                id="fuel-state"
                name="state"
                maxLength={2}
                value={state}
                onChange={(event) => setState(event.target.value)}
                className="min-h-12 text-white"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="fuel-station" className="text-slate-300">
              Station
            </label>
            <input
              id="fuel-station"
              name="station"
              value={station}
              onChange={(event) => setStation(event.target.value)}
              className="min-h-12 text-white"
            />
          </div>
        </div>
      ) : null}

      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          void onFilePicked(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        className="sr-only"
        onChange={(event) => {
          void onFilePicked(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {live ? (
        <div className="mt-4">
          <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-2xl bg-black" />
          <button
            type="button"
            className="mt-3 min-h-20 w-full rounded-2xl bg-gold text-xl font-bold text-navy shadow-sm"
            onClick={() => void snapLive()}
          >
            Snap
          </button>
          <button type="button" className="btn btn-ghost mt-2 min-h-12 w-full" onClick={stopLive}>
            Cancel camera
          </button>
        </div>
      ) : null}

      {draft ? (
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.previewUrl}
            alt="Photo preview"
            className="max-h-80 w-full rounded-2xl bg-slate-100 object-contain"
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="min-h-16 rounded-2xl bg-slate-200 text-lg font-semibold" onClick={retake}>
              Retake
            </button>
            <button
              type="button"
              className="min-h-16 rounded-2xl bg-navy text-lg font-semibold text-white"
              onClick={usePhoto}
            >
              Use photo
            </button>
          </div>
        </div>
      ) : null}

      {!live && !draft ? (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            className="min-h-20 w-full rounded-2xl bg-navy text-xl font-bold text-white shadow-sm"
            onClick={() => void takePhoto()}
          >
            Take photo
          </button>
          <button
            type="button"
            className="min-h-12 w-full rounded-2xl bg-white text-base font-semibold text-slate-800 ring-1 ring-slate-300"
            onClick={() => {
              if (!requireKind()) return;
              fileRef.current?.click();
            }}
          >
            Choose a file
          </button>
        </div>
      ) : null}

      {pages.length > 0 ? (
        <div className="mt-4">
          <div className="text-sm font-semibold text-white">
            {pages.length} page{pages.length === 1 ? "" : "s"}
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {pages.map((page, index) => (
              <div key={page.id} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.previewUrl}
                  alt={`Page ${index + 1}`}
                  className="h-20 w-16 rounded-lg object-cover ring-1 ring-slate-200"
                />
                <button
                  type="button"
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs text-white"
                  onClick={() => removePage(page.id)}
                  aria-label={`Remove page ${index + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary mt-3 min-h-12 w-full text-base"
            onClick={() => void takePhoto()}
            disabled={Boolean(draft || live)}
          >
            Add another page
          </button>
          <button
            type="button"
            className="btn btn-primary mt-2 min-h-14 w-full text-lg"
            onClick={() => void makePdfAndUpload()}
            disabled={pending}
          >
            {pending ? "Making PDF…" : "Make PDF and upload"}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      {saved ? <p className="mt-3 text-sm text-emerald-300">{saved}</p> : null}
    </section>
  );
}
