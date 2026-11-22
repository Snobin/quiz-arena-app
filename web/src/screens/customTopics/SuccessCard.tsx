import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { announce } from '../../shell/announce.ts';

type Props = { name: string; count: number; onAnother: () => void };

/**
 * Shown above the actions on the topic view right after an import or re-import: private, never rated. Focus moves to its
 * heading and the result is announced once. No usage meter shows while it is up.
 */
export function SuccessCard({ name, count, onAnother }: Props) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const title = t('import.success.title', { topic: name, count });
  useEffect(() => {
    heading.current?.focus();
    announce(title);
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-card p-4">
      <span aria-hidden="true" className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-band text-on-band">
        ✓
      </span>
      <h1 ref={heading} tabIndex={-1} className="font-title text-title">
        {title}
      </h1>
      <p className="text-muted">{t('import.success.sub')}</p>
      <button type="button" onClick={onAnother} className="hit-target inline-flex min-h-target-min items-center self-start text-body font-semibold text-ink underline">
        {t('import.another')}
      </button>
    </section>
  );
}
