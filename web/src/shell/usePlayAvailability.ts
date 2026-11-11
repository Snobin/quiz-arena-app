import { useTranslation } from 'react-i18next';
import { useOnline } from './online.ts';

export type PlayAvailability = { disabled: false; reason?: undefined } | { disabled: true; reason: string };

/**
 * Whether play actions (Quick Match, and later room joins and rematch) can start. Offline they
 * are `aria-disabled` with the reason as a caption; there is no offline play.
 */
export function usePlayAvailability(): PlayAvailability {
  const { t } = useTranslation();
  const online = useOnline();
  return online ? { disabled: false } : { disabled: true, reason: t('offline.playCaption') };
}
