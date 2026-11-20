import { useRef, useState } from 'react';
import { announce } from '../shell/announce.ts';
import { adminT } from './adminI18n.ts';
import { AdminApiError, uploadCsv, type UploadResult as Result } from './api.ts';
import { CSV_COLUMNS, MAX_BYTES, templateCsv } from './csv.ts';
import { UploadResult } from './UploadResult.tsx';
import { useAdminTitle } from './useAdminTitle.ts';

const PRIMARY = 'hit-target inline-flex min-h-target-min items-center rounded-md bg-band px-4 text-body text-on-band';

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** The size and extension problem for a chosen file, in words, or null when it may be sent. */
export function clientProblem(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) return adminT('upload.notCsv');
  if (file.size > MAX_BYTES) return adminT('upload.tooBig', { size: (file.size / (1024 * 1024)).toFixed(1) });
  return null;
}

function limitMessage(seconds: number | null): string {
  const minutes = Math.max(1, Math.ceil((seconds ?? 60) / 60));
  return minutes === 1 ? adminT('upload.limitMinute') : adminT('upload.limitMinutes', { minutes });
}

/** Story 3.3: choose a CSV, upload it, and see which rows became drafts and which need fixing. */
export function UploadPage() {
  useAdminTitle(adminT('nav.upload'));
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [result, setResult] = useState<{ data: Result; text: string } | null>(null);
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv())}`;

  const choose = (chosen: File | null) => {
    setResult(null);
    if (!chosen) {
      setFile(null);
      setProblem(null);
      return;
    }
    const found = clientProblem(chosen);
    setProblem(found);
    setFile(found ? null : chosen);
  };

  const submit = async (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (!file || sending.current) return;
    sending.current = true;
    setBusy(true);
    setProblem(null);
    setResult(null);
    try {
      const text = await readText(file).catch(() => '');
      const data = await uploadCsv(file);
      setResult({ data, text });
    } catch (error) {
      const message =
        error instanceof AdminApiError
          ? error.status === 429
            ? limitMessage(error.retryAfterSeconds)
            : (error.detail ?? adminT('upload.failed'))
          : adminT('upload.failed');
      setProblem(message);
      announce(message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const disabled = !file || busy;

  return (
    <main className="flex flex-col gap-4">
      <h1 tabIndex={-1} className="font-title text-title">
        {adminT('upload.title')}
      </h1>
      <p className="text-muted">{adminT('upload.intro')}</p>

      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-bold">{adminT('upload.file')}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
            className="min-h-target-min"
          />
        </label>
        <p className="text-muted">{adminT('upload.caps')}</p>
        {file ? <p>{adminT('upload.chosen', { name: file.name })}</p> : null}
        {problem ? (
          <p role="alert" className="text-body font-semibold text-brick">
            <span aria-hidden="true">⚠ </span>
            {problem}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            aria-disabled={disabled}
            aria-describedby={!file ? 'upload-caption' : undefined}
            className={PRIMARY}
            onClick={(event) => {
              if (disabled) event.preventDefault();
            }}
          >
            {busy ? adminT('upload.uploading') : adminT('upload.submit')}
          </button>
          {!file ? (
            <span id="upload-caption" className="text-muted">
              {adminT('upload.needFile')}
            </span>
          ) : null}
        </div>
      </form>

      {result ? <UploadResult result={result.data} fileText={result.text} /> : null}

      <section aria-labelledby="upload-columns" className="flex flex-col gap-2">
        <h2 id="upload-columns" className="text-body font-bold">
          {adminT('upload.columns')}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {CSV_COLUMNS.map((column) => (
            <li key={column}>
              <code className="font-code text-code">{column}</code>
            </li>
          ))}
        </ul>
        <p className="text-muted">{adminT('upload.columnsNote')}</p>
        <p>
          <a href={templateHref} download="minnal-questions-template.csv" className="hit-target inline-flex min-h-target-min items-center underline">
            {adminT('upload.template')}
          </a>
        </p>
      </section>
    </main>
  );
}
