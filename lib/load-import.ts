import { importItsValues, type ItsImportOptions, type ItsImportSummary } from "./its-import";
import {
  buildLoadImportPreview,
  loadValuesFromRecords,
  recordsFromLoadSheetText,
  type LoadImportPreviewRow,
} from "./load-import-shared";
import { listLoads } from "./queries";
import { recordsFromLoadWorkbook } from "./xlsx-first-sheet";

export function previewLoadsFromText(text: string): LoadImportPreviewRow[] {
  return buildLoadImportPreview(loadValuesFromRecords(recordsFromLoadSheetText(text)), listLoads({ status: "all" }));
}

export function previewLoadsFromXlsx(buffer: Uint8Array): LoadImportPreviewRow[] {
  return buildLoadImportPreview(loadValuesFromRecords(recordsFromLoadWorkbook(buffer)), listLoads({ status: "all" }));
}

export function applyLoadImport(
  rows: LoadImportPreviewRow[],
  options?: Partial<ItsImportOptions>,
): ItsImportSummary & { created: number; updated: number; skipped: number } {
  const summary = importItsValues(rows, {
    msTrailerAlias: true,
    importRate: true,
    createInactiveUnits: false,
    snapshot: null,
    ...options,
    apply: options?.apply ?? true,
  });
  return {
    ...summary,
    created: summary.added,
    updated: summary.updated,
    skipped: summary.skipped_tms_newer + summary.skipped_other,
  };
}
