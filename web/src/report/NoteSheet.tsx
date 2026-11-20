import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../auth/apiFetch.ts';
import { apiUrl } from '../config/apiBase.ts';
import { Button } from '../design/Button.tsx';
import { uiLanguage } from '../i18n/index.ts';
import { announce } from '../shell/announce.ts';
import { useOnline } from '../shell/online.ts';
import type { ReportSurface } from './ReportQuestion.tsx';

export const NOTE_MAX = 500;

type Status = 'editing' | 'sending' | 'sent' | 'duplicate';
/** A 400 is about the note only when the problem's errors[] names the note field. */
async function noteRejected(response: Response): Promise<boolean> {
  try {
    const problem = (await response.json()) as { errors?: { field?: string }[] };
    return problem.errors?.some((e) => e.field === 'note') === true;
  } catch {
    return false;
  }
}

type Failure = 'rateLimited' | 'tooLong' | 'failed';

type Props = {
  questionId: string;
  version: number;
  surface: ReportSurface;
  matchId?: string;
  autoFocus: boolean;
  /** The unsent note kept above this component, and where to keep it as she types. */
  initialNote: string;
  onNote: (note: string) => void;
  /** The report was sent (or was already open): the link goes away. */
  onSettled: () => void;
  onCancel: () => void;
};

/**
 * The inline note field under the caption row (Story 3.5): a labelled textarea with a live count, "Send report"
 * and "Cancel". Success replaces it with a thanks line; 409 with "already reported"; a failure keeps the note.
 */
export default function NoteSheet({ questionId, version, surface, matchId, autoFocus, initialNote, onNote, onSettled, onCancel }: Props) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const [note, setNote] = useState(initialNote);
  const [status, setStatus] = useState<Status>('editing');
  const [failure, setFailure] = useState<Failure | null>(null);
  const inFlight = useRef(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const ids = { note: useId(), error: useId(), count: useId() };

  useEffect(() => {
    if (autoFocus) noteRef.current?.focus();
  }, []);

  const settled = status === 'sent' || status === 'duplicate';
  useEffect(() => {
    if (!settled) return;
    messageRef.current?.focus();
    announce(t(status === 'sent' ? 'report.thanks' : 'report.duplicate'));
  }, [settled]);

  const send = async () => {
    if (inFlight.current || !online) return;
    inFlight.current = true;
    setStatus('sending');
    setFailure(null);
    try {
      const response = await apiFetch(apiUrl(`/api/core/v1/questions/${questionId}/versions/${version}/reports`), {
        method: 'POST',
        headers: { Accept: 'application/json, application/problem+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() === '' ? undefined : note, surface, matchId }),
      });
      if (response.status === 201 || response.status === 409) {
        onSettled();
        return setStatus(response.status === 201 ? 'sent' : 'duplicate');
      }
      setFailure(response.status === 429 ? 'rateLimited' : response.status === 400 && (await noteRejected(response)) ? 'tooLong' : 'failed');
    } catch {
      setFailure('failed');
    }
    inFlight.current = false;
    setStatus('editing');
  };

  const lang = uiLanguage(i18n);
  if (settled) {
    return (
      <p ref={messageRef} tabIndex={-1} lang={lang} data-testid={status === 'sent' ? 'report-thanks' : 'report-duplicate'} className="py-3 text-body text-ink">
        {t(status === 'sent' ? 'report.thanks' : 'report.duplicate')}
      </p>
    );
  }

  const sending = status === 'sending';
  const describedBy = [failure ? ids.error : null, ids.count].filter(Boolean).join(' ');
  return (
    <div data-testid="report-note" lang={lang} className="mt-2 w-full">
      <label htmlFor={ids.note} className="block text-label text-ink">
        {t('report.noteLabel')}
      </label>
      <textarea
        ref={noteRef}
        id={ids.note}
        rows={3}
        maxLength={NOTE_MAX}
        value={note}
        aria-invalid={failure === 'tooLong' ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          setNote(event.target.value);
          onNote(event.target.value);
        }}
        className="mt-1 w-full rounded-md border border-hairline bg-card p-3 font-option text-option text-ink"
      />
      <p id={ids.count} data-testid="report-count" className="text-right text-caption text-muted">
        {t('report.count', { n: note.length, max: NOTE_MAX })}
      </p>
      {failure ? (
        <p id={ids.error} role="alert" data-testid="report-error" className="mt-1 text-caption text-brick">
          <span aria-hidden="true">⚠ </span>
          {t(`report.error.${failure}`)}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {online ? (
          <Button data-testid="report-send" aria-busy={sending ? true : undefined} onClick={send}>
            {sending ? t('report.sending') : failure === 'failed' ? t('report.retry') : t('report.send')}
          </Button>
        ) : (
          <Button data-testid="report-send" disabled disabledReason={t('report.offlineCaption')}>
            {t('report.send')}
          </Button>
        )}
        {sending ? (
          <Button variant="secondary" disabled disabledReason={t('report.sending')}>
            {t('report.cancel')}
          </Button>
        ) : (
          <Button variant="secondary" onClick={onCancel}>
            {t('report.cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}
