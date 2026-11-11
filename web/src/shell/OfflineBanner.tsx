import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { announce } from './announce.ts';
import { useOnline } from './online.ts';

/**
 * Inline banner under the page top while offline. It is not a live region itself: it is
 * announced once per offline episode through the shared polite region.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  const message = t('offline.banner');
  const announced = useRef(false);

  useEffect(() => {
    if (online) {
      announced.current = false;
    } else if (!announced.current) {
      announced.current = true;
      announce(message);
    }
  }, [online, message]);

  if (online) return null;
  return (
    <div className="mx-auto w-full max-w-[480px] px-gutter-card pt-3">
      <p className="rounded-md border border-hairline bg-card px-4 py-3 text-body text-ink">{message}</p>
    </div>
  );
}
