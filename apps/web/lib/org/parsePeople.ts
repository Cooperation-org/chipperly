/** Turns pasted text or a CSV into rows for POST /accounts/:id/profiles/bulk. One person per line: name, group, parent email. */

export interface PersonRow {
  name: string;
  cluster_name?: string;
  parent_email?: string;
}

export const MAX_BULK = 1000;
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

export interface ParseResult {
  rows: PersonRow[];
  /** 1-based line numbers that could not be used, with why. */
  problems: { line: number; message: string }[];
}

/** Splits one CSV line, honouring double quotes. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === '\t' || c === ';') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Skips blank lines and a header row ("name, group, ..."). A bad email is reported, not guessed at. */
export function parsePeople(text: string): ParseResult {
  const rows: PersonRow[] = [];
  const problems: ParseResult['problems'] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const [name = '', group = '', email = ''] = splitLine(raw);
    if (rows.length === 0 && i === 0 && /^names?$/i.test(name) && problems.length === 0) return;
    if (!name) {
      problems.push({ line: i + 1, message: 'No name.' });
      return;
    }
    if (email && !EMAIL.test(email)) {
      problems.push({ line: i + 1, message: `"${email}" is not an email address.` });
      return;
    }
    rows.push({ name, ...(group ? { cluster_name: group } : {}), ...(email ? { parent_email: email } : {}) });
  });
  if (rows.length > MAX_BULK) {
    problems.push({ line: 0, message: `Add ${MAX_BULK} people at a time at most.` });
  }
  return { rows, problems };
}
