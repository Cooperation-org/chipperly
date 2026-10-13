import { CLUSTER_NAME_MAX, PERSON_NAME_MAX, type BulkPerson } from '../schemas/org.js';

export interface PeopleListError {
  /** Line number in the pasted text where the row starts (1 is the first line, header included). */
  row: number;
  message: string;
}

export interface PeopleListResult {
  people: BulkPerson[];
  errors: PeopleListError[];
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const NAME_HEADERS = new Set(['name', 'full name', 'person', 'primary user']);
const CLUSTER_HEADERS = new Set(['cluster', 'group', 'site', 'team', 'caseload']);
const EMAIL_HEADERS = new Set(['parent email', 'parent_email', 'parentemail', 'parent', 'email', 'family email']);

interface Rec {
  line: number;
  cells: string[];
}

/** RFC 4180 reader: quoted fields, commas and line breaks inside quotes, "" for a quote. Blank lines are dropped. */
function readRecords(text: string): Rec[] {
  const out: Rec[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  const endRecord = (): void => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== '')) out.push({ line: start, cells });
    cells = [];
    cell = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      cell = '';
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      start = line;
    } else cell += ch;
  }
  endRecord();
  return out;
}

/**
 * Turns pasted text or a CSV file into people for a bulk add. Two shapes:
 * one name per line, or CSV whose first row is a header with a name column and
 * optional cluster and parent email columns (any order, any case). A BOM,
 * blank lines, quoted fields and commas inside quotes are fine. Bad rows go to
 * `errors` and the rest still come through.
 */
export function parsePeopleList(input: string): PeopleListResult {
  const people: BulkPerson[] = [];
  const errors: PeopleListError[] = [];
  const records = readRecords(input.replace(/^﻿/, ''));
  if (records.length === 0) return { people, errors };

  const head = records[0]!.cells.map((c) => c.trim().toLowerCase());
  const nameCol = head.findIndex((h) => NAME_HEADERS.has(h));
  const clusterCol = head.findIndex((h) => CLUSTER_HEADERS.has(h));
  const emailCol = head.findIndex((h) => EMAIL_HEADERS.has(h));
  // A header needs a name column; "name" alone on the first line is also read as a header, not a person.
  const hasHeader = nameCol >= 0;

  const rows = hasHeader ? records.slice(1) : records;
  for (const rec of rows) {
    // Without a header a line is just a name, even one with a comma in it ("Lee, Sam").
    const name = (hasHeader ? (rec.cells[nameCol] ?? '') : rec.cells.join(',')).trim();
    const cluster = hasHeader && clusterCol >= 0 ? (rec.cells[clusterCol] ?? '').trim() : '';
    const email = hasHeader && emailCol >= 0 ? (rec.cells[emailCol] ?? '').trim() : '';
    if (!name) errors.push({ row: rec.line, message: 'Name is empty' });
    else if (name.length > PERSON_NAME_MAX) errors.push({ row: rec.line, message: `Name is longer than ${PERSON_NAME_MAX} characters` });
    else if (cluster.length > CLUSTER_NAME_MAX) errors.push({ row: rec.line, message: `Cluster is longer than ${CLUSTER_NAME_MAX} characters` });
    else if (email && !EMAIL.test(email)) errors.push({ row: rec.line, message: `"${email}" is not an email address` });
    else {
      const person: BulkPerson = { name };
      if (cluster) person.cluster_name = cluster;
      if (email) person.parent_email = email.toLowerCase();
      people.push(person);
    }
  }
  return { people, errors };
}
