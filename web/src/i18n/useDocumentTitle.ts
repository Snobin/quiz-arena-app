import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Sets `document.title` to "<title> · <brand>" (or the brand alone) in the UI language, updates
 * it when the language changes, and restores the previous title on unmount. Pass an already
 * translated title.
 *
 * Call it only from the route-level component (a screen or fixture). Layout and shell wrappers
 * must not: effects run child-first, so a wrapper's call would overwrite the screen's title.
 */
export function useDocumentTitle(title?: string): void {
  const { t } = useTranslation();
  const brand = t('brand.name');
  const full = title ? t('title.withBrand', { title, brand }) : brand;
  useEffect(() => {
    const previous = document.title;
    document.title = full;
    return () => {
      document.title = previous;
    };
  }, [full]);
}
