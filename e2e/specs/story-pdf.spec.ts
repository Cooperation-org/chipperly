import { expect, test } from '@playwright/test';
import { gotoTab, signUp } from '../helpers';

/** A real two-page PDF, each page with one line of text, built with correct xref offsets. */
function twoPagePdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
    null,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = (text: string) => {
    const body = `BT /F1 24 Tf 40 100 Td (${text}) Tj ET`;
    return `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
  };
  objects[3] = stream('We go to the dentist');
  objects[5] = stream('We sit in the big chair');
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('a picked PDF becomes a story with one picture page per PDF page', async ({ page }) => {
  await signUp(page, { name: 'Pdf Tester' });
  await gotoTab(page, 'stories');
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({ name: 'Dentist visit.pdf', mimeType: 'application/pdf', buffer: twoPagePdf() });
  await page.waitForURL('**/story/edit/**');
  await expect(page.getByRole('button', { name: 'Change picture for page 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change picture for page 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change picture for page 3' })).toHaveCount(0);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Dentist visit');
});
