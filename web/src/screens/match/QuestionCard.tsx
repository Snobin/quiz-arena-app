import { useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { uiLanguage } from '../../i18n/index.ts';
import type { Language } from '../../i18n/language.ts';
import type { QuestionView } from '../../realtime/protocol.ts';

const other = (language: Language): Language => (language === 'ml' ? 'en' : 'ml');
const textIn = (view: QuestionView, language: Language) => (language === 'ml' ? view.textMl : view.textEn);

/** The question's base language: the UI language when it has text in it, else the other one. */
export function baseLanguage(view: QuestionView, ui: Language): Language {
  return textIn(view, ui) !== undefined ? ui : other(ui);
}

type QuestionCardProps = {
  view: QuestionView;
  /** The heading's spoken position ("ചോദ്യം 4 / 10, 15 സെക്കൻഡ്"), read after the text. */
  position: string;
  headingRef: Ref<HTMLHeadingElement>;
  /** The mode label beside the EN tag; Quick Match's when omitted ("Topic Duel · <topic>" in a Topic Duel). */
  label?: string;
};

/**
 * The question: the mode label, the EN tag and the question heading. The text follows the UI
 * language and falls back to the other; the heading carries the text's `lang`. The EN tag
 * (48px hit area, 8px above the first line) shows the other-language text of this question
 * only: render it with `key` per question so it resets. It never touches settings, and it is
 * hidden when there is no other-language text.
 */
export function QuestionCard({ view, position, headingRef, label }: QuestionCardProps) {
  const { t, i18n } = useTranslation();
  const ui = uiLanguage(i18n);
  const base = baseLanguage(view, ui);
  const otherText = textIn(view, other(base));
  const [showOther, setShowOther] = useState(false);
  const shown: Language = showOther && otherText !== undefined ? other(base) : base;

  return (
    <section className="mt-4">
      <div className="mb-2 flex min-h-target-min items-center justify-between gap-3 py-1">
        <span data-testid="mode-label" className="min-w-[0] break-words text-label text-muted">
          {label ?? t('play.quickMatch')}
        </span>
        {otherText !== undefined ? (
          <button
            type="button"
            data-testid="en-tag"
            aria-pressed={showOther}
            aria-label={base === 'ml' ? t('match.showEnglish') : t('match.showMalayalam')}
            onClick={() => setShowOther((value) => !value)}
            className="inline-flex min-h-target-min min-w-target-min items-center justify-center rounded-sm"
          >
            <span
              lang={shown === 'ml' ? 'en' : 'ml'}
              className="rounded-sm border border-ink px-2 py-[2px] text-label font-semibold text-ink"
            >
              {shown === 'ml' ? t('match.tagEn') : t('match.tagMl')}
            </span>
          </button>
        ) : null}
      </div>
      <h1 ref={headingRef} tabIndex={-1} lang={shown} className="font-question text-question text-ink">
        {textIn(view, shown)}
        <span className="sr-only" lang={ui}>
          {', '}
          {position}
        </span>
      </h1>
    </section>
  );
}
