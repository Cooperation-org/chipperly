/** Saves text as a file through a temporary link. Browser only. */
export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Minutes behind UTC on this device's clock, sent so the server counts days the way the viewer does. */
export const tzOffset = (): number => new Date().getTimezoneOffset();

/** The report screens' words for a failed load. */
export const REPORT_ERROR = 'Could not load the report. Check your connection and try again.';
