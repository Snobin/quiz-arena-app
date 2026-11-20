import { describe, expect, it } from 'vitest';
import { CAPS, EMPTY_VALUES, validate, type Values } from './questionForm.ts';

const valid: Values = {
  ...EMPTY_VALUES,
  subjectId: 's1',
  topicId: 't1',
  examLevel: 'TENTH',
  difficulty: 'EASY',
  textEn: 'Which is the longest river in Kerala?',
  options: ['Periyar', 'Bharathapuzha', 'Pamba', 'Chaliyar'],
  answerIndex: '0',
  explanation: 'The Periyar is about 244 km long.',
};

const fields = (values: Values) => validate(values).map((p) => p.field);

describe('validate (mirror of the server QuestionValidator)', () => {
  it('accepts a valid question, with either language alone', () => {
    expect(validate(valid)).toEqual([]);
    expect(validate({ ...valid, textEn: '', textMl: 'കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി?' })).toEqual([]);
  });

  it('reports every problem, with the server field names', () => {
    expect(fields(EMPTY_VALUES)).toEqual([
      'subjectId',
      'topicId',
      'examLevel',
      'difficulty',
      'textMl/textEn',
      'optionA',
      'optionB',
      'optionC',
      'optionD',
      'answerIndex',
      'explanation',
    ]);
  });

  it('requires distinct options after trimming and case-folding', () => {
    expect(validate({ ...valid, options: ['Periyar', ' periyar ', 'Pamba', 'Chaliyar'] })).toEqual([{ field: 'options', problem: 'must be 4 different answers' }]);
  });

  it('treats NFC-equal options as the same', () => {
    expect(fields({ ...valid, options: ['é', 'é', 'b', 'c'] })).toEqual(['options']);
  });

  it('enforces the caps in characters, counting Malayalam code points, at the limit exactly', () => {
    expect(fields({ ...valid, textEn: 'x'.repeat(CAPS.text) })).toEqual([]);
    expect(validate({ ...valid, textEn: 'x'.repeat(CAPS.text + 1) })).toEqual([
      { field: 'textEn', problem: 'must be at most 1000 characters (got 1001)', fix: 'Shorten it by 1 characters.' },
    ]);
    expect(fields({ ...valid, textMl: 'ക'.repeat(CAPS.text + 1) })).toEqual(['textMl']);
    expect(fields({ ...valid, options: ['a', 'b', 'c', 'd'.repeat(CAPS.option + 1)] })).toEqual(['optionD']);
    expect(fields({ ...valid, explanation: 'e'.repeat(CAPS.explanation + 1) })).toEqual(['explanation']);
    expect(fields({ ...valid, attribution: 'a'.repeat(CAPS.attribution + 1) })).toEqual(['attribution']);
  });

  it('keeps chillu and ZWJ as characters and trims padding before counting', () => {
    const chillu = 'അവൻ‍‌';
    expect(fields({ ...valid, textMl: chillu.repeat(200) })).toEqual([]);
    expect(fields({ ...valid, textMl: chillu.repeat(201) })).toEqual(['textMl']);
    expect(fields({ ...valid, textEn: `   ${'x'.repeat(CAPS.text)}   ` })).toEqual([]);
  });
});
