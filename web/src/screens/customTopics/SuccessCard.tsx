import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import { announce } from '../../shell/announce.ts';

type Props = { name: string; count: number; onAnother: () => void };

/** Shown in place of the screen after a 201: private, never rated; Practice and Battle Room arrive with Stories 6.4 and 6.5. */
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
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <Button variant="primary" disabled disabledReason="">
          {t('import.success.battle')}
        </Button>
        <Button variant="secondary" disabled disabledReason="">
          {t('import.success.practice')}
        </Button>
      </div>
      <p className="text-caption text-muted">{t('import.success.soon')}</p>
      <button type="button" onClick={onAnother} className="hit-target inline-flex min-h-target-min items-center self-start text-body font-semibold text-ink underline">
        {t('import.another')}
      </button>
    </section>
  );
}
