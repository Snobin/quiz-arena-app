import { useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { detectLanguage } from '../../i18n/Lang.tsx';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

// Copied from the live-match option list rather than imported: sharing them would pull them into the entry chunk's
// exports and grow it (the Story 1.3 budget). Keep the gesture in step with `match/OptionList.tsx`.
const TAP_SLOP_PX = 10;
const BASE = 'flex min-h-[56px] w-full min-w-[0] items-center gap-3 rounded-md px-4 py-3 text-left font-option text-option';
const TILE = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-label font-semibold';
const STATUS = 'ml-auto shrink-0 text-caption font-caption';

type Gesture = { index: number; x: number; y: number; down: boolean };

/** Commit on lift: only `click` commits; a slide beyond 10px, leave or cancel while down is a scroll, not a tap. */
function useOptionGestures(answerable: boolean, onCommit: (optionIndex: number) => void) {
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
  return { pressed, handlers };
}
const TILE_IDLE = `${TILE} bg-tile text-muted`;

type PracticeOptionsProps = {
  options: readonly string[];
  /** True while the question is open, unanswered and online: only then does a tap commit. */
  answerable: boolean;
  /** The option whose answer request is in flight: it shows "…" until the response. */
  pending: number | null;
  /** The server's result for this question, or null while it is open. */
  reveal: { answerIndex: number; selfPick: number | null } | null;
  /** Offline: every option is `aria-disabled`. */
  unavailable: boolean;
  onCommit: (optionIndex: number) => void;
};

/**
 * Options A–D for Solo Practice: the same commit-on-lift gesture as the live match, but a reveal with no volt (UX-DR3).
 * The correct option takes an ink ✓ tile and bold text, her wrong pick is brick with ⚠, the rest are muted. Every mark
 * comes from the answer response; nothing here knows the answer before it arrives.
 */
export function PracticeOptions({ options, answerable, pending, reveal, unavailable, onCommit }: PracticeOptionsProps) {
  const { t } = useTranslation();
  const { pressed, handlers } = useOptionGestures(answerable, onCommit);
  return (
    <div className="mt-6 flex flex-col gap-option-gap">
      {options.map((option, index) => {
        let state = 'idle';
        let className = `${BASE} border border-control-edge bg-card text-ink`;
        let tile = (
          <span aria-hidden="true" className={TILE_IDLE}>
            {LETTERS[index]}
          </span>
        );
        let status = null;
        if (reveal) {
          const mine = reveal.selfPick === index;
          if (index === reveal.answerIndex) {
            state = 'correct';
            className = `${BASE} border-[1.5px] border-ink bg-card font-bold text-ink`;
            tile = (
              <span aria-hidden="true" data-testid="practice-correct-tile" className={`${TILE} bg-ink text-card`}>
                ✓
              </span>
            );
            status = (
              <span className={`${STATUS} text-ink`}>
                <span className="sr-only">{t('match.correctAnswer')}</span>
                {mine ? t('match.you') : null}
              </span>
            );
          } else if (mine) {
            state = 'wrong-pick';
            className = `${BASE} border-[1.5px] border-brick bg-card text-ink`;
            status = (
              <span className={`${STATUS} text-brick`}>
                <span aria-hidden="true">⚠ </span>
                {t('match.you')}
              </span>
            );
          } else {
            state = 'muted';
            className = `${BASE} border border-control-edge bg-card text-muted`;
          }
        } else if (pending === index) {
          state = 'pending';
          className = `${BASE} border border-ink bg-card text-ink`;
          status = (
            <span className={`${STATUS} text-ink`}>
              <span aria-hidden="true">…</span>
              <span className="sr-only">{t('match.sending')}</span>
            </span>
          );
        } else if (pressed === index && answerable) {
          state = 'pressed';
          className = `${BASE} border border-ink bg-card text-ink`;
        }
        return (
          <button
            key={index}
            type="button"
            data-testid={`option-${index}`}
            data-state={state}
            aria-disabled={unavailable || undefined}
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
