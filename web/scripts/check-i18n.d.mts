export type I18nViolation = {
  file: string;
  line: number;
  rule: 'jsx-text' | 'literal-attribute' | 'document-title' | 'misplaced-marker';
  message: string;
  match: string;
};

export const WEB_ROOT: string;
export const FIXTURE_MARKER: string;
export class MissingPathError extends Error {
  paths: string[];
}
export function webPath(file: string): string;
export function checkSource(file: string, text: string): I18nViolation[];
export function checkPaths(paths: string[], base?: string): I18nViolation[];
