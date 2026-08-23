"use client";

import { useEffect, useRef, useState } from "react";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

export function RateConPicker({
  inputId = "rate_con",
  fileName,
}: {
  inputId?: string;
  fileName?: string;
}) {
  const [name, setName] = useState(fileName ?? "");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (fileName) setName(fileName);
  }, [fileName]);

  function putFileOnInput(file: File) {
    const input = inputRef.current;
    if (!input) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
  }

  function assignFile(file: File | null) {
    fileRef.current = file;
    setName(file?.name ?? "");
    if (file) putFileOnInput(file);
  }

  useEffect(() => {
    const input = inputRef.current;
    if (fileRef.current && input && (!input.files || input.files.length === 0)) {
      putFileOnInput(fileRef.current);
    }
  });

  return (
    <div
      className={`rounded-xl border border-dashed px-4 py-5 ${
        drag ? "border-navy bg-slate-50" : "border-slate-300"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDrag(false);
        assignFile(event.dataTransfer.files?.[0] ?? null);
      }}
    >
      <label htmlFor={inputId} className="text-sm font-semibold">
        Rate con file
      </label>
      <p className="mt-1 text-sm text-slate-500">
        PDF or image. Drag and drop, or choose a file. Windows: if the picker says Custom Files, pick
        the PDF anyway — we accept it.
      </p>
      <input
        id={inputId}
        ref={inputRef}
        name="rate_con"
        type="file"
        className="mt-3 block w-full text-sm"
        accept={ACCEPT}
        onChange={(event) => assignFile(event.target.files?.[0] ?? null)}
      />
      {name ? (
        <p className="mt-2 font-mono text-xs text-slate-700">
          Chosen: {name}
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">No file chosen yet.</p>
      )}
    </div>
  );
}
