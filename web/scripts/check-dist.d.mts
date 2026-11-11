export type ManifestChunk = {
  file: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
};
export type Manifest = Record<string, ManifestChunk>;
export type TextFile = { file: string; text: string };
export type FileSize = { file: string; gzipBytes: number };

export const WEB_ROOT: string;
export const BUDGET_BYTES: number;
export const PRIMITIVE_DIRS: string[];
export const FIXTURE_SENTINEL: string;

export function initialJsFiles(manifest: Manifest, entryKey?: string): string[];
export function gzipBytes(content: string | Uint8Array): number;
export function checkBudget(sizes: FileSize[], budget?: number): { total: number; problems: string[] };
export function themeTokenNames(themeCss: string): string[];
export function missingTokens(builtCss: string, names: string[]): string[];
export function fixtureLeaks(jsFiles: TextFile[], manifest?: Manifest): string[];
export function extractClasses(file: string, text: string): string[];
export function escapeClass(name: string): string;
export function missingUtilities(builtCss: string, classes: string[]): string[];
export function fontUrl(fontsTs: string): string;
export function checkFont(input: { swJs: string; indexHtml: string; fontPath: string; base?: string }): string[];
export function checkServiceWorker(input: {
  indexHtml: string;
  files: string[];
  webManifest: Record<string, unknown>;
  swJs?: string;
}): string[];
export function checkBaseRebase(input: { cssFiles: TextFile[]; indexHtml: string; fontPath: string; base: string }): string[];
export function checkDist(distDir: string, webRoot?: string): { problems: string[]; initialJsBytes: number };
export function checkBaseBuild(base?: string, webRoot?: string): string[];
