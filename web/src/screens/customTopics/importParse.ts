/**
 * The client side of a custom-topic import (Story 6.2): a strict JSON reader that records where everything starts, a
 * schema walk, and a mirror of the server's CUSTOM_TOPIC validator rules. The server (Story 6.1) stays authoritative;
 * this only lets the player see the same problems, with line numbers, before anything is sent.
 *
 * Problems carry a `code` and `params`, not text: the screen words them in the UI language from the catalogue.
 */

export const MAX_QUESTION = 1000;
export const MAX_OPTION = 300;
export const MAX_EXPLANATION = 2000;
export const MAX_NAME = 80;

export type ProblemCode =
  | 'json.empty' | 'json.notObject' | 'json.extra' | 'json.comma' | 'json.end' | 'json.duplicate' | 'json.generic'
  | 'questions.missing' | 'questions.notList' | 'questions.empty' | 'topic.notText'
  | 'item.notObject' | 'question.type' | 'options.type' | 'option.type' | 'answer.type' | 'explanation.type'
  | 'question.required' | 'question.tooLong' | 'options.count' | 'options.blank' | 'options.duplicate' | 'option.tooLong'
  | 'answer.required' | 'answer.range' | 'explanation.required' | 'explanation.tooLong';

/** One problem. Local problems have `code`; server problems have `problem` text instead. `item` is the 1-based question. */
export type Problem = {
  item?: number;
  field: string;
  line?: number;
  column?: number;
  code?: ProblemCode;
  params?: Record<string, string | number>;
  /** Server wording (English), shown as is. */
  problem?: string;
  fix?: string;
};

export type ImportCheck = {
  /** The `"topic"` value, when it is text. */
  topic: string | null;
  /** How many entries the `questions` list has. */
  found: number;
  problems: Problem[];
  /** True when the text is not valid JSON; then `problems` holds that one problem. */
  syntax: boolean;
};

type Pos = { line: number; col: number; offset: number };
type Value =
  | { kind: 'object'; pos: Pos; members: { key: string; keyPos: Pos; value: Value }[] }
  | { kind: 'array'; pos: Pos; items: Value[] }
  | { kind: 'string'; pos: Pos; value: string }
  | { kind: 'number'; pos: Pos; value: number; integer: boolean }
  | { kind: 'literal'; pos: Pos; value: boolean | null };

class SyntaxProblem extends Error {
  constructor(
    readonly code: 'json.comma' | 'json.end' | 'json.duplicate' | 'json.generic' | 'json.extra',
    readonly pos: Pos,
    readonly near = '',
  ) {
    super(code);
  }
}

/**
 * A single wrapping Markdown fence (```json … ```) is blanked out, newlines kept, so every line and column still
 * refers to the pasted text.
 */
export function stripFence(text: string): string {
  const open = /^[ \t\r\n]*```[A-Za-z0-9_-]*[ \t]*\r?\n/.exec(text);
  if (!open) return text;
  const close = /\r?\n[ \t]*```[ \t\r\n]*$/.exec(text);
  if (!close || close.index < open[0].length - 1) return text;
  const inner = text.slice(open[0].length, close.index);
  if (inner.includes('```')) return text;
  const blank = (s: string) => s.replace(/[^\r\n]/g, ' ');
  return blank(open[0]) + inner + blank(text.slice(close.index));
}

class Reader {
  private i = 0;
  private line = 1;
  private col = 1;
  constructor(private readonly s: string) {}

  private pos(): Pos {
    return { line: this.line, col: this.col, offset: this.i };
  }

  private advance(): string {
    const ch = this.s[this.i++]!;
    if (ch === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  private peek(): string | undefined {
    return this.s[this.i];
  }

  private skipSpace(): void {
    while (this.i < this.s.length && ' \t\r\n'.includes(this.s[this.i]!)) this.advance();
  }

  private fail(code: SyntaxProblem['code']): never {
    const ch = this.peek();
    throw new SyntaxProblem(ch === undefined ? 'json.end' : code, this.pos(), ch ?? '');
  }

  read(): Value | null {
    this.skipSpace();
    if (this.i >= this.s.length) return null;
    const value = this.value();
    this.skipSpace();
    if (this.i < this.s.length) throw new SyntaxProblem('json.extra', this.pos());
    return value;
  }

  private value(): Value {
    this.skipSpace();
    const pos = this.pos();
    const ch = this.peek();
    if (ch === undefined) this.fail('json.generic');
    if (ch === '{') return this.object(pos);
    if (ch === '[') return this.array(pos);
    if (ch === '"') return { kind: 'string', pos, value: this.string() };
    if (ch === '-' || (ch >= '0' && ch <= '9')) return this.number(pos);
    for (const [word, value] of [['true', true], ['false', false], ['null', null]] as const) {
      if (this.s.startsWith(word, this.i)) {
        for (let n = 0; n < word.length; n++) this.advance();
        return { kind: 'literal', pos, value };
      }
    }
    return this.fail('json.generic');
  }

  private object(pos: Pos): Value {
    this.advance();
    const members: { key: string; keyPos: Pos; value: Value }[] = [];
    const seen = new Set<string>();
    this.skipSpace();
    if (this.peek() === '}') {
      this.advance();
      return { kind: 'object', pos, members };
    }
    for (;;) {
      this.skipSpace();
      const keyPos = this.pos();
      if (this.peek() !== '"') this.fail('json.generic');
      const key = this.string();
      if (seen.has(key)) throw new SyntaxProblem('json.duplicate', keyPos, key);
      seen.add(key);
      this.skipSpace();
      if (this.peek() !== ':') this.fail('json.generic');
      this.advance();
      members.push({ key, keyPos, value: this.value() });
      this.skipSpace();
      const next = this.peek();
      if (next === ',') {
        this.advance();
        continue;
      }
      if (next === '}') {
        this.advance();
        return { kind: 'object', pos, members };
      }
      this.fail('json.comma');
    }
  }

  private array(pos: Pos): Value {
    this.advance();
    const items: Value[] = [];
    this.skipSpace();
    if (this.peek() === ']') {
      this.advance();
      return { kind: 'array', pos, items };
    }
    for (;;) {
      items.push(this.value());
      this.skipSpace();
      const next = this.peek();
      if (next === ',') {
        this.advance();
        continue;
      }
      if (next === ']') {
        this.advance();
        return { kind: 'array', pos, items };
      }
      this.fail('json.comma');
    }
  }

  private string(): string {
    this.advance();
    let out = '';
    for (;;) {
      const ch = this.peek();
      if (ch === undefined) this.fail('json.end');
      if (ch === '"') {
        this.advance();
        return out;
      }
      if (ch < ' ') this.fail('json.generic');
      this.advance();
      if (ch !== '\\') {
        out += ch;
        continue;
      }
      const esc = this.peek();
      if (esc === undefined) this.fail('json.end');
      this.advance();
      const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (esc in simple) {
        out += simple[esc]!;
      } else if (esc === 'u') {
        const hex = this.s.slice(this.i, this.i + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('json.generic');
        for (let n = 0; n < 4; n++) this.advance();
        out += String.fromCharCode(parseInt(hex, 16));
      } else {
        this.i--;
        this.col--;
        this.fail('json.generic');
      }
    }
  }

  private number(pos: Pos): Value {
    const match = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(this.s.slice(this.i));
    if (!match) this.fail('json.generic');
    for (let n = 0; n < match[0].length; n++) this.advance();
    return { kind: 'number', pos, value: Number(match[0]), integer: match[2] === undefined && match[3] === undefined };
  }
}

const at = (p: Pos) => ({ line: p.line, column: p.col });
const length = (s: string) => [...s.normalize('NFC').trim()].length;
const blank = (s: string | null | undefined) => s == null || s.trim() === '';

/** Reads the pasted text and returns everything wrong with it, in the order it appears. */
export function checkImport(pasted: string): ImportCheck {
  let root: Value | null;
  try {
    root = new Reader(stripFence(pasted)).read();
  } catch (e) {
    if (e instanceof SyntaxProblem) {
      return {
        topic: null,
        found: 0,
        syntax: true,
        problems: [{ field: 'json', code: e.code === 'json.extra' ? 'json.extra' : e.code, params: { line: e.pos.line, column: e.pos.col, near: e.near }, ...at(e.pos) }],
      };
    }
    throw e;
  }
  const problems: Problem[] = [];
  if (!root) {
    return { topic: null, found: 0, syntax: false, problems: [{ field: 'json', code: 'json.empty', line: 1, column: 1 }] };
  }
  if (root.kind !== 'object') {
    return { topic: null, found: 0, syntax: false, problems: [{ field: 'json', code: 'json.notObject', ...at(root.pos) }] };
  }
  let topic: string | null = null;
  let questions: Value | null = null;
  for (const m of root.members) {
    if (m.key === 'topic') {
      if (m.value.kind === 'string') topic = m.value.value;
      else if (!(m.value.kind === 'literal' && m.value.value === null)) problems.push({ field: 'topic', code: 'topic.notText', ...at(m.value.pos) });
    } else if (m.key === 'questions') {
      questions = m.value;
    }
  }
  let found = 0;
  if (!questions) {
    problems.push({ field: 'questions', code: 'questions.missing', ...at(root.pos) });
  } else if (questions.kind !== 'array') {
    problems.push({ field: 'questions', code: 'questions.notList', ...at(questions.pos) });
  } else {
    found = questions.items.length;
    if (found === 0) problems.push({ field: 'questions', code: 'questions.empty', ...at(questions.pos) });
    questions.items.forEach((item, index) => problems.push(...checkQuestion(item, index + 1)));
  }
  return { topic, found, problems, syntax: false };
}

function checkQuestion(node: Value, item: number): Problem[] {
  if (node.kind !== 'object') return [{ item, field: 'question', code: 'item.notObject', ...at(node.pos) }];
  const out: Problem[] = [];
  const get = (key: string) => node.members.find((m) => m.key === key);
  const problem = (field: string, code: ProblemCode, pos: Pos, params?: Problem['params']): Problem => ({ item, field, code, params, ...at(pos) });
  const isNull = (v: Value) => v.kind === 'literal' && v.value === null;

  const text = (key: 'question' | 'explanation', required: ProblemCode, tooLong: ProblemCode, max: number) => {
    const m = get(key);
    if (!m || isNull(m.value)) return out.push(problem(key, required, m?.keyPos ?? node.pos));
    if (m.value.kind !== 'string') return out.push(problem(key, `${key}.type` as ProblemCode, m.value.pos));
    if (blank(m.value.value)) return out.push(problem(key, required, m.value.pos));
    const n = length(m.value.value);
    if (n > max) out.push(problem(key, tooLong, m.value.pos, { count: n, max, over: n - max }));
  };
  text('question', 'question.required', 'question.tooLong', MAX_QUESTION);

  const options = get('options');
  if (!options || isNull(options.value)) {
    out.push(problem('options', 'options.count', options?.keyPos ?? node.pos, { got: 0 }));
  } else if (options.value.kind !== 'array') {
    out.push(problem('options', 'options.type', options.value.pos));
  } else {
    const list = options.value.items;
    const texts: string[] = [];
    let bad = false;
    list.forEach((o, i) => {
      if (o.kind !== 'string') {
        bad = true;
        out.push(problem('options', 'option.type', o.pos, { n: i + 1 }));
      } else {
        texts.push(o.value);
      }
    });
    if (!bad) {
      if (list.length !== 4) {
        out.push(problem('options', 'options.count', options.value.pos, { got: list.length }));
      } else {
        const seen = new Set<string>();
        let nonBlank = 0;
        list.forEach((o, i) => {
          const value = (o as { value: string }).value;
          if (blank(value)) out.push(problem('options', 'options.blank', o.pos, { n: i + 1 }));
          else {
            nonBlank++;
            seen.add(value.normalize('NFC').trim().toLowerCase());
            const n = length(value);
            if (n > MAX_OPTION) out.push(problem('options', 'option.tooLong', o.pos, { n: i + 1, count: n, max: MAX_OPTION, over: n - MAX_OPTION }));
          }
        });
        if (seen.size < nonBlank) out.push(problem('options', 'options.duplicate', options.value.pos));
      }
    }
  }

  const answer = get('answer');
  if (!answer || isNull(answer.value)) {
    out.push(problem('answer', 'answer.required', answer?.keyPos ?? node.pos));
  } else if (answer.value.kind !== 'number' || !answer.value.integer) {
    out.push(problem('answer', 'answer.type', answer.value.pos));
  } else if (answer.value.value < 0 || answer.value.value > 3) {
    out.push(problem('answer', 'answer.range', answer.value.pos, { got: answer.value.value }));
  }

  text('explanation', 'explanation.required', 'explanation.tooLong', MAX_EXPLANATION);
  return out;
}

/** The character offset of a 1-based line and column in `text`, for placing the caret. */
export function offsetOf(text: string, line: number, column = 1): number {
  let offset = 0;
  for (let l = 1; l < line; l++) {
    const next = text.indexOf('\n', offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return Math.min(text.length, offset + Math.max(0, column - 1));
}
