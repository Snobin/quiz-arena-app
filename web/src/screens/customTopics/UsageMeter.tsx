import { useTranslation } from 'react-i18next';
import type { Usage } from './importApi.ts';

function Bar({ id, label, value, cap, valueText }: { id: string; label: string; value: number; cap: number; valueText: string }) {
  const percent = cap > 0 ? Math.min(100, Math.round((value / cap) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-caption text-muted">
        <span id={id}>{label}</span>
        <span className="tabular-nums">{`${value} / ${cap}`}</span>
      </div>
      <div
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={value}
        aria-valuetext={valueText}
        className="h-[4px] w-full overflow-hidden rounded-sm bg-hairline"
      >
        <div className="h-[4px] bg-ink" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/**
 * The usage meter (Story 6.3): the tally of both caps and one 4 px bar per cap. At 80% or more of either cap it takes the warning
 * variant: a 1.5 px ink outline and a "!" line with the headroom and a way out. Monochrome, never brick or volt.
 */
export function UsageMeter({ usage }: { usage: Usage }) {
  const { t } = useTranslation();
  const warnQuestions = usage.questions * 5 >= usage.questionCap * 4;
  const warnTopics = usage.topics * 5 >= usage.topicCap * 4;
  const warn = warnQuestions || warnTopics;
  return (
    <section
      aria-label={t('manage.title')}
      data-testid="usage-meter"
      data-warn={warn ? 'true' : undefined}
      className={`flex flex-col gap-2 rounded-lg bg-card p-4 ${warn ? 'border-[1.5px] border-ink' : 'border border-hairline'}`}
    >
      <p className="text-body font-semibold tabular-nums text-ink">
        {t('manage.meter.tally', { topics: usage.topics, topicCap: usage.topicCap, questions: usage.questions, questionCap: usage.questionCap })}
      </p>
      <Bar
        id="meter-topics"
        label={t('manage.meter.topics')}
        value={usage.topics}
        cap={usage.topicCap}
        valueText={t('manage.meter.topics.value', { value: usage.topics, cap: usage.topicCap })}
      />
      <Bar
        id="meter-questions"
        label={t('manage.meter.questions')}
        value={usage.questions}
        cap={usage.questionCap}
        valueText={t('manage.meter.questions.value', { value: usage.questions, cap: usage.questionCap })}
      />
      {warn ? (
        <p className="flex items-start gap-2 text-caption text-ink">
          <span aria-hidden="true" className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-band text-on-band">
            !
          </span>
          {warnQuestions
            ? t('manage.meter.warn.questions', { left: Math.max(0, usage.questionCap - usage.questions) })
            : t('manage.meter.warn.topics', { left: Math.max(0, usage.topicCap - usage.topics) })}
        </p>
      ) : null}
    </section>
  );
}
