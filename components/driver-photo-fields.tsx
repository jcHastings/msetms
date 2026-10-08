"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import {
  CAMERA_ACCEPT,
  CAMERA_CAPTURE,
  EMPTY_GALLERY_MESSAGE,
  EMPTY_PICK_SETTLE_MS,
  GALLERY_ACCEPT,
  emptyPickMessage,
  handlePhotoInputChange,
  parkFileForSubmit,
  shouldSignalEmptyPick,
  type PhotoPickSource,
} from "@/lib/driver-photo-pick";

export function DriverPhotoFields({
  entry,
  tone = "dark",
  cameraLabel,
  galleryLabel = "Choose from photos",
  cameraEmphasis = "primary",
  onPick,
  disabled = false,
  submitName,
}: {
  entry: string;
  tone?: "dark" | "light";
  cameraLabel: string;
  galleryLabel?: string;
  cameraEmphasis?: "primary" | "secondary";
  onPick: (file: File, source: PhotoPickSource) => void;
  disabled?: boolean;
  /** When set, the chosen file is copied here so a normal form post can send it. */
  submitName?: string;
}) {
  const reactId = useId();
  const base = `driver-photo-${reactId.replace(/:/g, "")}`;
  const cameraId = `${base}-camera`;
  const galleryId = `${base}-gallery`;
  const helpId = `${base}-help`;
  const noticeId = `${base}-notice`;
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const pickedRef = useRef(false);
  const watchStop = useRef<(() => void) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chosenName, setChosenName] = useState<string | null>(null);
  const [namedSource, setNamedSource] = useState<"camera" | "gallery" | "holder">("holder");

  useEffect(() => {
    const nodes: Array<{ node: HTMLInputElement; source: PhotoPickSource }> = [];
    if (cameraRef.current) nodes.push({ node: cameraRef.current, source: "camera" });
    if (galleryRef.current) nodes.push({ node: galleryRef.current, source: "gallery" });
    const cleanups = nodes.map(({ node, source }) => {
      const onCancel = () => {
        if (pickedRef.current) return;
        setNotice(source === "camera" ? emptyPickMessage("camera", false) : EMPTY_GALLERY_MESSAGE);
      };
      node.addEventListener("cancel", onCancel);
      return () => node.removeEventListener("cancel", onCancel);
    });
    return () => {
      for (const cleanup of cleanups) cleanup();
      watchStop.current?.();
    };
  }, []);

  function armWatch(source: PhotoPickSource) {
    if (disabled) return;
    pickedRef.current = false;
    setNotice(null);
    watchStop.current?.();
    let left = false;
    let stopped = false;
    let timer = 0;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
    const report = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (shouldSignalEmptyPick({ left, picked: pickedRef.current })) {
          setNotice(emptyPickMessage(source, false));
        }
        stop();
      }, EMPTY_PICK_SETTLE_MS);
    };
    const onBlur = () => {
      left = true;
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") left = true;
      if (document.visibilityState === "visible" && left) report();
    };
    const onFocus = () => {
      if (left) report();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    watchStop.current = stop;
  }

  function onChange(source: PhotoPickSource) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const incoming = input.files?.[0] ?? null;
      const holderNode = input.form?.querySelector('input[data-photo-role="submit"]');
      const holder = holderNode instanceof HTMLInputElement ? holderNode : null;
      const needsHold = Boolean(submitName && holder);
      if (needsHold && holder && incoming && incoming.size > 0) {
        const parked = parkFileForSubmit(holder, incoming);
        if (!parked) {
          // Keep the file on this input so the form can still post it.
          pickedRef.current = true;
          setNamedSource(source);
          setChosenName(incoming.name);
          setNotice(null);
          onPick(incoming, source);
          return;
        }
      }
      const { file, message } = handlePhotoInputChange(input, source);
      if (!file) {
        setNotice(message);
        return;
      }
      pickedRef.current = true;
      setNotice(null);
      if (needsHold) {
        setNamedSource("holder");
        setChosenName(file.name);
      }
      onPick(file, source);
    };
  }

  const describedBy = notice ? `${helpId} ${noticeId}` : helpId;
  const cameraClass =
    cameraEmphasis === "primary"
      ? "driver-photo-trigger driver-photo-trigger-primary"
      : "driver-photo-trigger driver-photo-trigger-secondary";

  return (
    <div className="driver-photo-fields" data-driver-photo-entry={entry} data-tone={tone}>
      <label htmlFor={cameraId} className={cameraClass} aria-disabled={disabled || undefined}>
        <span>{cameraLabel}</span>
        <input
          ref={cameraRef}
          id={cameraId}
          data-photo-role="camera"
          type="file"
          accept={CAMERA_ACCEPT}
          capture={CAMERA_CAPTURE}
          className="driver-photo-input"
          name={submitName && namedSource === "camera" ? submitName : undefined}
          disabled={disabled}
          aria-describedby={describedBy}
          onClick={() => armWatch("camera")}
          onChange={onChange("camera")}
        />
      </label>
      <label htmlFor={galleryId} className="driver-photo-trigger driver-photo-trigger-secondary" aria-disabled={disabled || undefined}>
        <span>{galleryLabel}</span>
        <input
          ref={galleryRef}
          id={galleryId}
          data-photo-role="gallery"
          type="file"
          accept={GALLERY_ACCEPT}
          className="driver-photo-input"
          name={submitName && namedSource === "gallery" ? submitName : undefined}
          disabled={disabled}
          aria-describedby={describedBy}
          onClick={() => armWatch("gallery")}
          onChange={onChange("gallery")}
        />
      </label>
      {submitName ? (
        <input
          data-photo-role="submit"
          type="file"
          name={submitName && namedSource === "holder" ? submitName : undefined}
          accept={GALLERY_ACCEPT}
          className="driver-photo-input driver-photo-input-hold"
          tabIndex={-1}
          aria-hidden="true"
        />
      ) : null}
      {submitName && chosenName ? (
        <p className="driver-photo-chosen" role="status">
          Photo attached: {chosenName}
        </p>
      ) : null}
      <p id={helpId} className="driver-photo-help">
        If the camera does not open, use Choose from photos.
      </p>
      {notice ? (
        <p id={noticeId} className="driver-photo-notice" role="alert">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
