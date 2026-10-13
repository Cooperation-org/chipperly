export interface ParsedPerson {
  name: string;
  cluster_name?: string;
  parent_email?: string;
}

export interface PeopleListResult {
  people: ParsedPerson[];
  errors: { row: number; message: string }[];
}

export const MAX_PEOPLE_PER_UPLOAD = 1000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Splits one CSV line; double quotes may wrap a cell that holds a comma. */
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const GROUP_HEADERS = ['group', 'cluster', 'site', 'team', 'caseload'];
const EMAIL_HEADERS = ['parent email', 'parent_email', 'email'];

/**
 * One person per line: "name", or CSV "name,group,parent email". A first line
 * that starts with "name" is a header and sets the column order. Row numbers
 * are 1-based line numbers, so they match what the person sees in the file.
 */
export function parsePeopleList(text: string): PeopleListResult {
  const people: ParsedPerson[] = [];
  const errors: PeopleListResult['errors'] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let cols = { name: 0, group: 1, email: 2 };
  let start = 0;

  const first = lines.findIndex((l) => l.trim() !== '');
  if (first >= 0) {
    const head = splitLine(lines[first]!).map((c) => c.toLowerCase());
    if (head[0] === 'name') {
      cols = {
        name: 0,
        group: head.findIndex((c) => GROUP_HEADERS.includes(c)),
        email: head.findIndex((c) => EMAIL_HEADERS.includes(c)),
      };
      start = first + 1;
    }
  }

  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    const row = i + 1;
    if (people.length >= MAX_PEOPLE_PER_UPLOAD) {
      errors.push({ row, message: `Only the first ${MAX_PEOPLE_PER_UPLOAD} people are added at once.` });
      break;
    }
    const cells = splitLine(line);
    const name = (cells[cols.name] ?? '').slice(0, 80);
    const group = cols.group >= 0 ? (cells[cols.group] ?? '') : '';
    const email = cols.email >= 0 ? (cells[cols.email] ?? '') : '';
    if (!name) {
      errors.push({ row, message: 'Missing a name.' });
      continue;
    }
    if (email && !EMAIL.test(email)) {
      errors.push({ row, message: `"${email}" is not an email address.` });
      continue;
    }
    people.push({ name, ...(group ? { cluster_name: group } : {}), ...(email ? { parent_email: email } : {}) });
  }
  return { people, errors };
}
