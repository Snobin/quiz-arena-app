import { describe, expect, it } from 'vitest';
import { checkImport, offsetOf, stripFence } from './importParse.ts';

const q = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ question: 'Q?', options: ['a', 'b', 'c', 'd'], answer: 1, explanation: 'E', ...over });
const topic = (...qs: string[]) => `{"topic": "T", "questions": [${qs.join(',')}]}`;
const codes = (text: string) => checkImport(text).problems.map((p) => `${p.item ?? '-'}:${p.code}`);

describe('checkImport: valid input', () => {
  it('reads the topic and counts the questions with no problems', () => {
    expect(checkImport(topic(q(), q()))).toMatchObject({ topic: 'T', found: 2, problems: [], syntax: false });
  });

  it('ignores unknown keys on the root and on a question', () => {
    expect(checkImport(`{"id": 1, "questions": [${q({ id: 7, difficulty: 'easy' })}]}`).problems).toEqual([]);
  });

  it('accepts Malayalam with chillu and ZWJ', () => {
    const text = q({ question: 'അവൻ‍‌ ക്ഷ ന്റ ത്ത്ര എവിടെ?', options: ['കൊച്ചി', 'ൽ', 'ൻ', 'ർ'], explanation: 'കാരണം.' });
    expect(checkImport(topic(text)).problems).toEqual([]);
  });
});

describe('checkImport: fences', () => {
  it('strips one wrapping fence and keeps line numbers pointing into the pasted text', () => {
    const pasted = '```json\n{"questions": [\n' + q({ answer: 9 }) + '\n]}\n```\n';
    expect(stripFence(pasted).split('\n')).toHaveLength(pasted.split('\n').length);
    const found = checkImport(pasted);
    expect(found.problems.map((p) => p.code)).toEqual(['answer.range']);
    expect(found.problems[0]!.line).toBe(3);
  });

  it('leaves text with an inner fence or no closing fence alone', () => {
    expect(stripFence('```json\n{}')).toBe('```json\n{}');
    expect(checkImport('```json\n{}').syntax).toBe(true);
  });
});

describe('checkImport: syntax', () => {
  it('gives line, column and the missing-comma cause', () => {
    const found = checkImport('{\n  "questions": [\n    {"question": "Q?" "options": []}\n  ]\n}');
    expect(found.syntax).toBe(true);
    expect(found.problems).toHaveLength(1);
    expect(found.problems[0]).toMatchObject({ code: 'json.comma', line: 3 });
    expect(found.problems[0]!.column).toBeGreaterThan(1);
  });

  it('says a truncated paste ends too early', () => {
    expect(checkImport('{"questions": [{"question": "Q?"').problems[0]!.code).toBe('json.end');
  });

  it.each([
    ['a comment', '{"questions": [] /* c */}'],
    ['a trailing comma', '{"questions": [],}'],
    ['single quotes', "{'questions': []}"],
    ['a duplicate key', '{"questions": [], "questions": []}'],
    ['text after the end', '{"questions": []} trailing'],
    ['a raw newline in a string', '{"questions": [{"question": "a\nb"}]}'],
    ['a bad escape', '{"topic": "a\\qb", "questions": []}'],
    ['a leading zero', '{"questions": [{"answer": 01}]}'],
  ])('rejects %s as a syntax problem', (_name, text) => {
    expect(checkImport(text).syntax).toBe(true);
  });

  it('is empty or not an object when there is nothing usable', () => {
    expect(checkImport('   ').problems[0]!.code).toBe('json.empty');
    expect(checkImport('[1, 2]').problems[0]!.code).toBe('json.notObject');
  });
});

describe('checkImport: schema and the validator mirror', () => {
  it('reports every problem with the question number and where it starts', () => {
    const text =
      '{"questions": [\n' +
      q() + ',\n' +
      q({ options: ['a', 'b', 'c'] }) + ',\n' +
      q({ answer: 4, explanation: ' ' }) + '\n]}';
    const found = checkImport(text);
    expect(found.problems.map((p) => `${p.item}:${p.code}`)).toEqual(['2:options.count', '3:answer.range', '3:explanation.required']);
    expect(found.problems[0]).toMatchObject({ field: 'options', line: 3, params: { got: 3 } });
    expect(found.problems[1]!.line).toBe(4);
  });

  it('covers the missing-list, zero-question and topic-type cases', () => {
    expect(codes('{"topic": "x"}')).toEqual(['-:questions.missing']);
    expect(codes('{"questions": {}}')).toEqual(['-:questions.notList']);
    expect(codes('{"questions": []}')).toEqual(['-:questions.empty']);
    expect(codes(`{"topic": 5, "questions": [${q()}]}`)).toEqual(['-:topic.notText']);
    expect(checkImport(`{"topic": null, "questions": [${q()}]}`).problems).toEqual([]);
  });

  it('reports wrong types on a question without adding a second problem for the same field', () => {
    const text = topic('"not an object"', '{"question": 7, "options": ["a", 2, "c", "d"], "answer": "1", "explanation": ["x"]}');
    expect(codes(text)).toEqual(['1:item.notObject', '2:question.type', '2:option.type', '2:answer.type', '2:explanation.type']);
  });

  it('applies the option rules: blank, duplicate after NFC and case-folding, and the length cap', () => {
    expect(codes(topic(q({ options: ['a', ' ', 'c', 'd'] })))).toEqual(['1:options.blank']);
    expect(codes(topic(q({ options: ['Periyar', ' periyar ', 'c', 'd'] })))).toEqual(['1:options.duplicate']);
    expect(codes(topic(q({ options: ['é', 'é', 'c', 'd'] })))).toEqual(['1:options.duplicate']);
    expect(codes(topic(q({ options: ['a', 'b', 'c', 'd'.repeat(301)] })))).toEqual(['1:option.tooLong']);
  });

  it('counts characters, not UTF-16 units, after NFC and trimming; 1000 is allowed, 1001 is not', () => {
    expect(codes(topic(q({ question: 'x'.repeat(1000) })))).toEqual([]);
    expect(codes(topic(q({ question: 'x'.repeat(1001) })))).toEqual(['1:question.tooLong']);
    expect(codes(topic(q({ question: '😀'.repeat(1000) })))).toEqual([]);
    expect(codes(topic(q({ explanation: 'e'.repeat(2001) })))).toEqual(['1:explanation.tooLong']);
  });

  it('requires a whole answer from 0 to 3', () => {
    expect(codes(topic(q({ answer: -1 })))).toEqual(['1:answer.range']);
    expect(codes(topic(q({ answer: 1.5 })))).toEqual(['1:answer.type']);
    expect(codes(topic(q({ answer: null })))).toEqual(['1:answer.required']);
    expect(codes(topic(q({ answer: 0 })))).toEqual([]);
    expect(codes(topic(q({ answer: 3 })))).toEqual([]);
  });
});

describe('offsetOf', () => {
  it('finds the caret offset of a line and column', () => {
    expect(offsetOf('ab\ncd\nef', 2, 2)).toBe(4);
    expect(offsetOf('ab\ncd', 9, 1)).toBe(5);
    expect(offsetOf('ab', 1, 99)).toBe(2);
  });
});
