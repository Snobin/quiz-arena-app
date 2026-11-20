import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n.ts';
import { LiveRegions } from '../shell/LiveRegions.tsx';
import { resetAnnouncements } from '../shell/announce.ts';
import { syncFromLocation } from '../shell/router.ts';
import { jsonResponse } from '../test-utils/guest.ts';
import type { UploadResult } from './api.ts';
import { parseCsv } from './csv.ts';
import { UploadPage } from './UploadPage.tsx';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../auth/apiFetch.ts', () => ({ apiFetch }));

const result = (extra: Partial<UploadResult> = {}): UploadResult => ({
  importedCount: 40,
  errorCount: 0,
  imported: [],
  createdSubjects: [],
  createdTopics: [],
  errors: [],
  ...extra,
});

function csvFile(name = 'paper.csv', content = 'category,subject\nKERALA_PSC,History\nbad,row\n') {
  return new File([content], name, { type: 'text/csv' });
}

function renderPage() {
  return render(
    <>
      <LiveRegions />
      <UploadPage />
    </>,
  );
}

const input = () => screen.getByLabelText('CSV file') as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /^(Upload|Uploading…)$/ });

function choose(file: File) {
  fireEvent.change(input(), { target: { files: [file] } });
}

async function send(file = csvFile()) {
  choose(file);
  await act(async () => {
    fireEvent.click(submit());
  });
}

beforeEach(() => {
  apiFetch.mockReset();
  resetAnnouncements();
  window.history.replaceState(null, '', '/admin/upload');
  syncFromLocation();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
});

describe('UploadPage before an upload', () => {
  it('shows the labelled input, the columns, the caps and an aria-disabled Upload with a caption', () => {
    renderPage();
    expect(input().getAttribute('accept')).toContain('.csv');
    expect(screen.getByText('textMl')).toBeTruthy();
    expect(screen.getByText('sourceRef')).toBeTruthy();
    expect(screen.getByText(/Up to 2 MB and 1,000 rows/)).toBeTruthy();
    expect(submit().getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Choose a CSV file to upload.')).toBeTruthy();
    fireEvent.click(submit());
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('offers a template with a header row and one Malayalam and English example row', () => {
    renderPage();
    const link = screen.getByRole('link', { name: 'Download template' });
    expect(link.getAttribute('download')).toBe('minnal-questions-template.csv');
    const rows = parseCsv(decodeURIComponent((link.getAttribute('href') ?? '').split(',').slice(1).join(',')));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.[0]).toBe('category');
  });

  it('rejects a non-CSV file or one over 2 MB without uploading', () => {
    renderPage();
    choose(csvFile('paper.xlsx'));
    expect(screen.getByRole('alert').textContent).toContain('Choose a .csv file');
    expect(submit().getAttribute('aria-disabled')).toBe('true');
    const big = csvFile('big.csv');
    Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 });
    choose(big);
    expect(screen.getByRole('alert').textContent).toContain('File is 3.0 MB; the limit is 2 MB. Split it into smaller files.');
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('UploadPage upload', () => {
  it('sends multipart FormData with field file and no JSON content type', async () => {
    apiFetch.mockResolvedValue(jsonResponse(result()));
    renderPage();
    await send();
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [url, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/api/core/v1/admin/uploads');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    expect(JSON.stringify(init.headers)).not.toContain('Content-Type');
  });

  it('shows only the summary and the review link when every row is valid', async () => {
    apiFetch.mockResolvedValue(jsonResponse(result()));
    renderPage();
    await send();
    expect((await screen.findAllByText('40 imported as drafts · 0 rows need fixes')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Review 40 drafts' }).getAttribute('href')).toContain('/admin?status=DRAFT');
    expect(screen.queryByRole('button', { name: 'Download rows to fix (CSV)' })).toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('lists created subjects and topics so a typo is visible', async () => {
    apiFetch.mockResolvedValue(jsonResponse(result({ createdSubjects: ['Science'], createdTopics: ['Physics', 'Phisics'] })));
    renderPage();
    await send();
    expect(await screen.findByText('Created 1 new subject: Science')).toBeTruthy();
    expect(screen.getByText('Created 2 new topics: Physics, Phisics')).toBeTruthy();
  });

  it('shows Uploading… and ignores a second submit while the first is in flight', async () => {
    let finish: (r: Response) => void = () => undefined;
    apiFetch.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
    renderPage();
    await send();
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(submit().textContent).toBe('Uploading…');
    await act(async () => {
      fireEvent.click(submit());
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    await act(async () => finish(jsonResponse(result())));
    expect((await screen.findAllByText(/imported as drafts/)).length).toBeGreaterThan(0);
  });

  it('shows the file-level 400 detail and keeps the file', async () => {
    apiFetch.mockResolvedValue(jsonResponse({ detail: 'Save the file as CSV UTF-8 and upload again', errors: [] }, 400, 'application/problem+json'));
    renderPage();
    await send();
    expect((await screen.findByRole('alert')).textContent).toContain('Save the file as CSV UTF-8 and upload again');
    expect(screen.getByText('Chosen: paper.csv')).toBeTruthy();
  });

  it('on 429 shows the wait in minutes without clearing the chosen file', async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: 429 }), { status: 429, headers: { 'content-type': 'application/problem+json', 'Retry-After': '720' } }),
    );
    renderPage();
    await send();
    expect((await screen.findByRole('alert')).textContent).toContain('Upload limit reached. Try again in 12 minutes.');
    expect(screen.getByText('Chosen: paper.csv')).toBeTruthy();
    expect(submit().getAttribute('aria-disabled')).toBe('false');
  });
});

describe('UploadPage result with problems', () => {
  const errors = [
    { row: 3, field: 'answerIndex', problem: 'must be 0–3', fix: 'Use 0 for A … 3 for D' },
    { row: 3, field: 'explanation', problem: 'required' },
  ];

  it('focuses a role=alert summary and lists each problem with its field tag and fix', async () => {
    apiFetch.mockResolvedValue(jsonResponse(result({ importedCount: 1, errorCount: 1, errors })));
    renderPage();
    await send();
    const alert = await screen.findByRole('alert');
    expect(document.activeElement).toBe(alert);
    expect(within(alert).getByText('2 problems to fix')).toBeTruthy();
    const items = within(alert).getAllByRole('listitem');
    expect(items[0]?.textContent).toContain('Row 3 · answerIndex · must be 0–3 · Use 0 for A … 3 for D');
    expect(items[0]?.querySelector('code')?.textContent).toBe('answerIndex');
    expect(items[1]?.textContent).toContain('Row 3 · explanation · required');
    expect(screen.getAllByText('1 imported as drafts · 1 row needs fixes').length).toBeGreaterThan(0);
  });

  it('says nothing was imported when every row fails', async () => {
    apiFetch.mockResolvedValue(jsonResponse(result({ importedCount: 0, errorCount: 1, errors })));
    renderPage();
    await send();
    expect((await screen.findAllByText('Nothing was imported. Every row needs fixes.')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Review/ })).toBeNull();
  });

  it('over 20 problems shows the first 20 grouped by field', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ row: i + 2, field: i % 2 ? 'textEn' : 'answerIndex', problem: 'bad' }));
    apiFetch.mockResolvedValue(jsonResponse(result({ importedCount: 0, errorCount: 25, errors: many })));
    renderPage();
    await send();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getAllByRole('listitem')).toHaveLength(20);
    expect(within(alert).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['answerIndex', 'textEn']);
    expect(within(alert).getByText(/Showing the first 20 of 25 problems/)).toBeTruthy();
  });

  it('downloads the failed rows as BOM CSV with an errors column', async () => {
    apiFetch.mockResolvedValue(jsonResponse(result({ importedCount: 1, errorCount: 1, errors: [{ row: 3, field: 'subject', problem: 'required' }] })));
    let saved: Blob | null = null;
    Object.assign(URL, {
      createObjectURL: vi.fn((b: Blob) => {
        saved = b;
        return 'blob:x';
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderPage();
    await send();
    fireEvent.click(await screen.findByRole('button', { name: 'Download rows to fix (CSV)' }));
    expect(saved).not.toBeNull();
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(saved as unknown as Blob);
    });
    // FileReader decodes UTF-8 and drops a BOM, so check the raw bytes for the BOM.
    const bytes = new Uint8Array(await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(saved as unknown as Blob);
    }));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(parseCsv(text)).toEqual([
      ['category', 'subject', 'errors'],
      ['bad', 'row', 'subject: required'],
    ]);
  });

  it('copies the errors as tab-separated lines and announces Copied politely', async () => {
    apiFetch.mockResolvedValue(jsonResponse(result({ importedCount: 1, errorCount: 1, errors })));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    await send();
    fireEvent.click(await screen.findByRole('button', { name: 'Copy errors' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('3\tanswerIndex\tmust be 0–3\n3\texplanation\trequired'));
    expect(await screen.findAllByText('Copied')).not.toHaveLength(0);
  });
});
