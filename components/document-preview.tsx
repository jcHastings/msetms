"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { downloadWithoutLeaving } from "@/lib/open-generated-pdf";

export type DocumentPreviewItem = {
  attachmentId: number;
  title: string;
  description?: string;
};

type DocumentPreviewContextValue = {
  openPreview: (item: DocumentPreviewItem, siblings?: DocumentPreviewItem[]) => void;
};

const DocumentPreviewContext = createContext<DocumentPreviewContextValue | null>(null);

export function useDocumentPreview(): DocumentPreviewContextValue | null {
  return useContext(DocumentPreviewContext);
}

export function DocumentPreviewProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [items, setItems] = useState<DocumentPreviewItem[]>([]);

  const openPreview = useCallback((item: DocumentPreviewItem, siblings?: DocumentPreviewItem[]) => {
    const list = siblings?.length ? siblings : [item];
    const found = list.findIndex((row) => row.attachmentId === item.attachmentId);
    setItems(list);
    setIndex(found >= 0 ? found : 0);
    setOpen(true);
  }, []);

  const current = items[index] ?? null;
  const value = useMemo(() => ({ openPreview }), [openPreview]);

  return (
    <DocumentPreviewContext.Provider value={value}>
      {children}
      {open && current ? (
        <div
          className="document-preview-overlay"
          role="dialog"
          aria-label="Document Preview / Edit"
          data-document-preview=""
          data-ignore-dirty=""
        >
          <div className="document-preview-panel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
              <h2 className="text-sm font-semibold">Document Preview / Edit</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={index <= 0}
                  onClick={() => setIndex((value) => Math.max(0, value - 1))}
                >
                  Previous document
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={index >= items.length - 1}
                  onClick={() => setIndex((value) => Math.min(items.length - 1, value + 1))}
                >
                  Next document
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <iframe
                key={current.attachmentId}
                title={current.title}
                src={`/api/attachments/${current.attachmentId}`}
                className="min-h-[70vh] w-full border-0 bg-slate-100"
              />
              <aside className="space-y-3 border-l border-slate-200 p-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Document name</div>
                  <p className="mt-1 text-sm font-semibold">{current.title}</p>
                </div>
                {current.description ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Full description
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{current.description}</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      const frame = document.querySelector<HTMLIFrameElement>("[data-document-preview] iframe");
                      frame?.contentWindow?.print();
                    }}
                  >
                    Print
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => downloadWithoutLeaving(`/api/attachments/${current.attachmentId}?download=1`, `${current.title}.pdf`)}
                  >
                    Download
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </DocumentPreviewContext.Provider>
  );
}
