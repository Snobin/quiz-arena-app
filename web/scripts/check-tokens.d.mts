export type TokenViolation = {
  file: string;
  line: number;
  rule: 'dim-as-text' | 'dim-raw-value' | 'volt-outside-peak' | 'outline-none';
  message: string;
  match: string;
};

export const WEB_ROOT: string;
export class MissingPathError extends Error {
  paths: string[];
}
export function webPath(file: string): string;
export function isPeakPath(file: string): boolean;
export function checkSource(file: string, text: string): TokenViolation[];
export function checkPaths(paths: string[], base?: string): TokenViolation[];
