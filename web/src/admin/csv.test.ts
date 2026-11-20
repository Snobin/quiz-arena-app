import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, parseCsv, rowsToFix, templateCsv, toCsv } from './csv.ts';

describe('parseCsv', () => {
  it('reads RFC 4180 quoting: commas, doubled quotes and line breaks inside a field', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
    ]);
  });

  it('strips a BOM and keeps blank lines as rows so numbers match the spreadsheet', () => {
    const records = parseCsv('﻿a,b\n1,2\n\n3,4\n');
    expect(records).toHaveLength(4);
    expect(records[0]).toEqual(['a', 'b']);
    expect(records[3]).toEqual(['3', '4']);
  });

  it('keeps empty cells and Malayalam joiners byte for byte', () => {
    expect(parseCsv('a,,c\nക്‌ഷ,ന്‍ന,')).toEqual([
      ['a', '', 'c'],
      ['ക്‌ഷ', 'ന്‍ന', ''],
    ]);
  });
});

describe('toCsv', () => {
  it('starts with a BOM, quotes what needs it and round-trips through parseCsv', () => {
    const rows = [['a', 'b'], ['x,y', 'q"r\ns']];
    const text = toCsv(rows);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsv(text)).toEqual(rows);
  });
});

describe('templateCsv', () => {
  it('is the header plus one Malayalam and English example row', () => {
    const rows = parseCsv(templateCsv());
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.length).toBe(CSV_COLUMNS.length);
    expect(rows[1]?.[5]).toMatch(/[ഀ-ൿ]/);
    expect(rows[1]?.[6]).toMatch(/[A-Za-z]/);
  });
});

describe('rowsToFix', () => {
  const file = 'a,b\n1,2\n3,4\n5,6\n';

  it('keeps the original values of failed rows and adds an errors column', () => {
    const out = parseCsv(rowsToFix(file, [{ row: 3, field: 'b', problem: 'bad' }, { row: 3, field: 'a', problem: 'worse' }]));
    expect(out).toEqual([
      ['a', 'b', 'errors'],
      ['3', '4', 'b: bad; a: worse'],
    ]);
  });

  it('replaces an errors column left from an earlier download', () => {
    const out = parseCsv(rowsToFix('a,errors\n1,old\n', [{ row: 2, field: 'a', problem: 'new' }]));
    expect(out).toEqual([
      ['a', 'errors'],
      ['1', 'a: new'],
    ]);
  });

  it('pads a short row and cuts a long row to the header width before the errors cell', () => {
    const out = parseCsv(rowsToFix('a,b,c\n1,2\n1,2,3,4,5\n', [{ row: 2, field: 'row', problem: 'short' }, { row: 3, field: 'row', problem: 'long' }]));
    expect(out).toEqual([
      ['a', 'b', 'c', 'errors'],
      ['1', '2', '', 'row: short'],
      ['1', '2', '3', 'row: long'],
    ]);
  });
});
