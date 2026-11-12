import { Fragment, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CORRECT_OPTION_CLASS, CORRECT_STATUS_CLASS, CorrectTile } from '../../design/peak/CorrectOption.tsx';
import { detectLanguage, Lang } from '../../i18n/Lang.tsx';
import type { MyAnswer } from '../../realtime/liveGameStore.ts';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/** A move beyond this (CSS px) between down and lift is a scroll, not a tap. */
export const TAP_SLOP_PX = 10;

/**
 * What the reveal says about each option, straight from the server: QUESTION_REVEALED, or (1v1,
 * Story 1.11) her own ANSWER_ACCEPTED result before the question closes.
 */
export type OptionReveal = {
  answerIndex: number;
  /** The receiver's pick, or null when she did not answer. */
  selfPick: number | null;
  /** Opponents' picks per option index: participant id and unchanged name (empty when partial). */
  picks: Record<number, Array<{ participantId: string; name: string }>>;
  /**
   * True for her own result before the close: only the correct answer and her pick are marked;
   * the other options keep their plain look until QUESTION_REVEALED.
   */
  partial?: boolean;
};

type OptionListProps = {
  options: readonly string[];
  /** True while the question is open and unanswered: only then does a tap commit. */
  answerable: boolean;
  myAnswer: MyAnswer | null;
  reveal: OptionReveal | null;
  onCommit: (optionIndex: number) => void;
};

type Gesture = { index: number; x: number; y: number; down: boolean };

const BASE =
  'flex min-h-[56px] w-full min-w-[0] items-center gap-3 rounded-md px-4 py-3 text-left font-option text-option';
const TILE = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-label font-semibold';
const STATUS = 'ml-auto shrink-0 text-caption font-caption';

/**
 * Options A–D (min-height 56px, text wraps, never truncated). Commit on lift: pressed (ink
 * border) shows on pointerdown; a move over 10px, pointerleave or pointercancel while down
 * cancels the press and the click that follows is ignored. Only `click` commits (keyboard
 * Enter/Space included), with `touch-action: manipulation`. After the commit the option shows
 * "…" until the ack, then the lock (1.5px ink border, ink letter tile, "ലോക്ക്"); later taps
 * are ignored. At the reveal every mark comes from the payload: the correct option takes the
 * band fill and volt ✓, your wrong pick is brick, opponents' picks carry their names, and the
 * other non-chosen options turn muted. A partial reveal (her own 1v1 result before the close)
 * marks only the correct option and her pick.
 */
export function OptionList({ options, answerable, myAnswer, reveal, onCommit }: OptionListProps) {
  const { t } = useTranslation();
  const [pressed, setPressed] = useState<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  /** Set when a press was cancelled: the browser may still fire `click`, which must not commit. */
  const ignoreClick = useRef(false);

  const cancelPress = () => {
    if (gesture.current?.down) ignoreClick.current = true;
    gesture.current = null;
    setPressed(null);
  };

  const handlers = (index: number) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      ignoreClick.current = false;
      if (!answerable) return;
      // Touch pointers are captured implicitly; release so sliding off fires pointerleave.
      try {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Not supported: the 10px slop still turns a slide into a scroll.
      }
      gesture.current = { index, x: event.clientX, y: event.clientY, down: true };
      setPressed(index);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const g = gesture.current;
      if (!g?.down || g.index !== index) return;
      if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > TAP_SLOP_PX) cancelPress();
    },
    onPointerUp: () => {
      if (gesture.current) gesture.current.down = false;
      setPressed(null);
    },
    onPointerLeave: () => {
      if (gesture.current?.down) cancelPress();
    },
    onPointerCancel: () => {
      if (gesture.current?.down) cancelPress();
    },
    onKeyDown: () => {
      ignoreClick.current = false;
    },
    onClick: () => {
      gesture.current = null;
      setPressed(null);
      if (ignoreClick.current) {
        ignoreClick.current = false;
        return;
      }
      if (answerable) onCommit(index);
    },
  });

  return (
    <div className="mt-6 flex flex-col gap-option-gap">
      {options.map((option, index) => {
        const names = reveal?.picks[index] ?? [];
        let className: string;
        let tile = (
          <span aria-hidden="true" className={`${TILE} bg-tile text-muted`}>
            {LETTERS[index]}
          </span>
        );
        let status: ReactNode = null;
        let state: string;

        if (reveal) {
          const correct = index === reveal.answerIndex;
          const mine = reveal.selfPick === index;
          const labels: ReactNode[] = [
            ...(mine ? [t('match.you')] : []),
            ...names.map((pick) => <Lang key={pick.participantId}>{pick.name}</Lang>),
          ];
          const labelLine = labels.length ? (
            <span data-testid={`picks-${index}`}>
              {labels.map((label, i) => (
                <Fragment key={i}>
                  {i > 0 ? ' · ' : null}
                  {label}
                </Fragment>
              ))}
            </span>
          ) : null;
          if (correct) {
            state = 'correct';
            className = `${BASE} ${CORRECT_OPTION_CLASS}`;
            tile = <CorrectTile />;
            status = (
              <span className={`${STATUS} ${CORRECT_STATUS_CLASS}`}>
                <span className="sr-only">{t('match.correctAnswer')}</span>
                {labelLine}
              </span>
            );
          } else if (reveal.partial && !mine) {
            // Waiting for the close: no final styling yet, and no opponent pick.
            state = 'idle';
            className = `${BASE} border border-control-edge bg-card text-ink`;
          } else {
            state = mine ? 'wrong-pick' : 'muted';
            className = mine
              ? `${BASE} border-[1.5px] border-brick bg-card text-ink`
              : `${BASE} border border-control-edge bg-card text-muted`;
            status = labelLine ? <span className={`${STATUS} text-brick`}>{labelLine}</span> : null;
          }
        } else if (myAnswer?.optionIndex === index) {
          if (myAnswer.status === 'locked') {
            state = 'locked';
            className = `${BASE} border-[1.5px] border-ink bg-card text-ink`;
            tile = (
              <span aria-hidden="true" className={`${TILE} bg-ink text-card`}>
                {LETTERS[index]}
              </span>
            );
            status = <span className={`${STATUS} text-ink`}>{t('match.lockTag')}</span>;
          } else {
            state = 'pending';
            className = `${BASE} border border-ink bg-card text-ink`;
            status = (
              <span className={`${STATUS} text-ink`}>
                <span aria-hidden="true">…</span>
                <span className="sr-only">{t('match.sending')}</span>
              </span>
            );
          }
        } else if (pressed === index && answerable) {
          state = 'pressed';
          className = `${BASE} border border-ink bg-card text-ink`;
        } else {
          state = 'idle';
          className = `${BASE} border border-control-edge bg-card text-ink`;
        }

        return (
          <button
            key={index}
            type="button"
            data-testid={`option-${index}`}
            data-state={state}
            className={className}
            style={{ touchAction: 'manipulation' }}
            {...handlers(index)}
          >
            {tile}
            <span lang={detectLanguage(option)} className="min-w-[0] flex-1">
              {option}
            </span>
            {status}
          </button>
        );
      })}
    </div>
  );
}
