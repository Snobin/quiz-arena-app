import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../auth/session.ts';
import * as lastResult from '../realtime/lastResult.ts';
import type { QuestionSource } from '../realtime/protocol.ts';
import { announce } from '../shell/announce.ts';
import { getReportState, patchReportState, reportKey } from './reportState.ts';

// The note field and its request load only when a player opens it (the bundle budget).
const NoteSheet = lazy(() => import('./NoteSheet.tsx'));

export type ReportSurface = 'LIVE_REVEAL' | 'RESULTS' | 'SOLO';

export type ReportQuestionProps = {
  questionId: string;
  version: number;
  surface: ReportSurface;
  /** The match the question was asked in; none for Solo Practice. */
  matchId?: string;
  /** null = unknown: no link. Only a bank question is reportable. */
  questionSource: QuestionSource | null;
  /**
   * Live reveal (about 2 s): the tap only marks the question, with no note field and no request. The caller keeps
   * the mark; `marked` shows it.
   */
  onMark?: () => void;
  marked?: boolean;
  /** Results: the note field is open from the start (the question was marked during the live reveal). */
  startOpen?: boolean;
};

const ROW = 'mt-1 flex flex-col items-end';
const LINK = 'hit-target inline-flex min-h-target-min min-w-target-min items-center justify-end px-2 text-caption font-semibold text-ink underline';

/**
 * Story 3.5: the "Something wrong?" link and its note field, one component for every surface (Solo Practice
 * reuses it in Epic 4). It renders nothing for a guest or a custom-topic question. Rendered next to the
 * source/attribution caption, never inside it.
 */
export function ReportQuestion(props: ReportQuestionProps) {
  const { questionId, version, surface, matchId, questionSource, onMark, marked = false, startOpen = false } = props;
  const { t } = useTranslation();
  const registered = useSession((s) => s.status === 'registered');
  const key = reportKey(matchId, questionId, version);
  const [open, setOpenState] = useState(() => (getReportState(key).settled ? false : (getReportState(key).open ?? startOpen)));
  const [settled, setSettledState] = useState(() => getReportState(key).settled);
  const setOpen = (value: boolean) => {
    patchReportState(key, { open: value });
    setOpenState(value);
  };
  const linkRef = useRef<HTMLButtonElement>(null);
  // Focus goes to the note field only when she opened it herself, never when it starts open.
  const [focusNote, setFocusNote] = useState(false);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (!open && restoreFocus.current) {
      restoreFocus.current = false;
      linkRef.current?.focus();
    }
  }, [open]);

  if (!registered || questionSource !== 'BANK') return null;

  if (onMark) {
    if (marked) {
      return (
        <div className={ROW}>
          <p data-testid="report-marked" className="min-h-target-min py-3 text-caption text-muted">
            {t('report.marked')}
          </p>
        </div>
      );
    }
    return (
      <div className={ROW}>
        <button
          type="button"
          data-testid="report-link"
          className={LINK}
          onClick={() => {
            onMark();
            announce(t('report.marked'));
          }}
        >
          {t('report.link')}
        </button>
      </div>
    );
  }

  return (
    <div className={ROW}>
      {settled ? null : (
        <button
          ref={linkRef}
          type="button"
          data-testid="report-link"
          aria-expanded={open}
          className={LINK}
          onClick={() => {
            setFocusNote(true);
            setOpen(!open);
          }}
        >
          {t('report.link')}
        </button>
      )}
      {open ? (
        <Suspense fallback={null}>
          <NoteSheet
            questionId={questionId}
            version={version}
            surface={surface}
            matchId={matchId}
            autoFocus={focusNote}
            initialNote={getReportState(key).note}
            onNote={(note) => patchReportState(key, { note })}
            onSettled={() => {
              // Sent (or already reported): the link stays gone and the mark no longer reopens the field.
              patchReportState(key, { settled: true, open: false, note: '' });
              if (matchId) lastResult.removeMark(matchId, questionId, version);
              setSettledState(true);
            }}
            onCancel={() => {
              restoreFocus.current = true;
              setOpen(false);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
