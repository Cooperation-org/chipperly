// CSV for the admin site's "Download CSV" buttons, built in the browser.

/** One cell: quoted when it holds a comma, quote or line break; a leading = + - @ gets a ' so a spreadsheet never runs it as a formula. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header row plus rows, CRLF line ends, with a BOM so Excel reads UTF-8. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>): string {
  return `\uFEFF${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Saves the text as a file through a temporary link. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** "chipperly-payments-2026-10-13.csv" */
export const csvName = (what: string) => `chipperly-${what}-${new Date().toISOString().slice(0, 10)}.csv`;
