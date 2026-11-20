import { useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n/index.ts';
import { OptionList } from '../screens/match/OptionList.tsx';
import { RevealDetails } from '../screens/match/RevealDetails.tsx';
import { adminT } from './adminI18n.ts';
import { norm, type Values } from './questionForm.ts';

type Lang = 'ml' | 'en';

/** The text a player in `lang` sees: their language when present, else the other one (FR11), and whether that fell back. */
export function textFor(values: Pick<Values, 'textMl' | 'textEn'>, lang: Lang): { text: string; fellBack: boolean } {
  const own = norm(lang === 'ml' ? values.textMl : values.textEn);
  const other = norm(lang === 'ml' ? values.textEn : values.textMl);
  if (own) return { text: own, fellBack: false };
  return { text: other, fellBack: other !== '' };
}

function Pane({ lang, values }: { lang: Lang; values: Values }) {
  // The player cards and reveal block read the UI language, so each pane gets its own language.
  const instance = useMemo(() => i18n.cloneInstance({ lng: lang }), [lang]);
  const { text, fellBack } = textFor(values, lang);
  const answer = values.answerIndex === '' ? null : Number(values.answerIndex);
  const attribution = norm(values.attribution);
  const explanation = norm(values.explanation);
  return (
    <I18nextProvider i18n={instance}>
      <section aria-labelledby={`preview-${lang}`} className="flex min-w-[0] flex-col gap-2 rounded-lg border border-hairline bg-card p-4">
        <h3 id={`preview-${lang}`} className="text-label text-muted">
          {adminT(lang === 'ml' ? 'preview.ml' : 'preview.en')}
        </h3>
        {fellBack ? <p className="text-caption font-semibold text-ink">{adminT(lang === 'ml' ? 'preview.fallback.ml' : 'preview.fallback.en')}</p> : null}
        {text ? (
          <p lang={fellBack ? (lang === 'ml' ? 'en' : 'ml') : lang} className="font-question text-question text-ink" data-testid={`preview-text-${lang}`}>
            {text}
          </p>
        ) : (
          <p className="text-muted">{adminT('preview.empty')}</p>
        )}
        <OptionList
          options={values.options.map((option) => norm(option) || '—')}
          answerable={false}
          myAnswer={null}
          reveal={answer === null ? null : { answerIndex: answer, selfPick: null, picks: {} }}
          onCommit={() => undefined}
        />
        <RevealDetails explanation={explanation || '—'} attribution={attribution || null} />
      </section>
    </I18nextProvider>
  );
}

/** The question as players will see it, in two panes (Malayalam and English), using the player option cards and reveal block. */
export function QuestionPreview({ values }: { values: Values }) {
  return (
    <section aria-label={adminT('preview.title')} className="flex flex-col gap-2">
      <h2 className="text-label font-bold">{adminT('preview.title')}</h2>
      <div className="grid grid-cols-1 gap-4">
        <Pane lang="ml" values={values} />
        <Pane lang="en" values={values} />
      </div>
    </section>
  );
}
