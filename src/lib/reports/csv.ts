import Papa from "papaparse";

/** CSV download with a UTF-8 BOM so Excel opens it correctly. Money columns are already decimal strings. */
export function csvResponse(filename: string, rows: Record<string, unknown>[], columns?: string[]): Response {
  const csv = Papa.unparse(rows, { columns, newline: "\r\n" });
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
