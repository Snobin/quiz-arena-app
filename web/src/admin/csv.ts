/** The columns an upload file must carry, in the order the template uses. Mirrors core's AdminUploadService. */
export const CSV_COLUMNS = [
  'category',
  'subject',
  'topic',
  'examLevel',
  'difficulty',
  'textMl',
  'textEn',
  'optionA',
  'optionB',
  'optionC',
  'optionD',
  'answerIndex',
  'explanation',
  'attribution',
  'sourceRef',
] as const;

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 1000;

/** One example row, in Malayalam and English. */
export const TEMPLATE_ROW = [
  'KERALA_PSC',
  'Geography',
  'Kerala',
  'TENTH',
  'EASY',
  'കേരളത്തിന്റെ തലസ്ഥാനം ഏത്?',
  'What is the capital of Kerala?',
  'തിരുവനന്തപുരം',
  'കൊച്ചി',
  'കോഴിക്കോട്',
  'തൃശ്ശൂർ',
  '0',
  'Thiruvananthapuram is the capital of Kerala.',
  'Example',
  'EXAMPLE-1',
];

const BOM = '﻿';

/**
 * RFC 4180: comma-separated, double-quoted fields may hold commas, quotes and line breaks. Records are numbered as in
 * a spreadsheet, so index `n - 1` is row `n` (the header is row 1) and a blank line is still a row.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  let started = false;
  const endCell = () => {
    record.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    records.push(record);
    record = [];
    started = false;
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
      started = true;
    } else if (ch === ',') {
      endCell();
      started = true;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      endRecord();
    } else {
      cell += ch;
      started = true;
    }
  }
  if (started || cell !== '' || record.length > 0) endRecord();
  return records;
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** UTF-8 CSV text with a BOM (so Excel reads Malayalam) and CRLF line ends. */
export function toCsv(rows: string[][]): string {
  return BOM + rows.map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';
}

export function templateCsv(): string {
  return toCsv([[...CSV_COLUMNS], TEMPLATE_ROW]);
}

export type RowProblem = { row: number; field: string; problem: string; fix?: string };

/**
 * The original values of every failed row plus an `errors` column. An `errors` column already in the file (from an
 * earlier download) is replaced, so the result can be fixed and uploaded again.
 */
export function rowsToFix(text: string, problems: RowProblem[]): string {
  const records = parseCsv(text);
  const header = records[0] ?? [];
  const drop = header.findIndex((h) => h.trim().toLowerCase() === 'errors');
  const strip = (r: string[]) => (drop < 0 ? r : r.filter((_, i) => i !== drop));
  const width = strip(header).length;
  // A short or long row is padded or cut to the header's width so the errors cell lands in its own column.
  const fit = (r: string[]) => Array.from({ length: width }, (_, i) => strip(r)[i] ?? '');
  const byRow = new Map<number, string[]>();
  for (const p of problems) byRow.set(p.row, [...(byRow.get(p.row) ?? []), `${p.field}: ${p.problem}`]);
  const out: string[][] = [[...strip(header), 'errors']];
  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    const record = records[row - 1];
    if (record) out.push([...fit(record), (byRow.get(row) ?? []).join('; ')]);
  }
  return toCsv(out);
}
