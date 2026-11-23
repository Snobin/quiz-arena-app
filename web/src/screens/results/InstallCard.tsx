import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import { installState, offerKind, promptInstall, saveInstallState, useInstallSnapshot } from '../../install/installPrompt.ts';
import { announce } from '../../shell/announce.ts';
import './installCatalogue.ts';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The install card (Story 7.2): one quiet inline offer on a registered player's results, in the Sign-in nudge style. Shown while
 * her state on this device is PENDING and the browser can install (a kept `beforeinstallprompt`) or it is iOS Safari (instructions
 * only); with neither she stays eligible for her next results. Never a modal, no animation, no volt.
 */
export function InstallCard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const { event, installed } = useInstallSnapshot();
  // Read once per mount: her state at the moment these results opened (a failing store reads as DISMISSED).
  const [state, setState] = useState(() => installState(userId));
  const [gone, setGone] = useState(false);

  // The first completed match on this device is recorded whether or not the card can show.
  useEffect(() => {
    if (state === 'PENDING') saveInstallState(userId, 'PENDING');
  }, []);

  // `appinstalled` can fire without the card's own button (browser menu): settle it the same way.
  useEffect(() => {
    if (installed && state === 'PENDING') {
      saveInstallState(userId, 'INSTALLED');
      setState('INSTALLED');
      announce(t('install.done'));
    }
  }, [installed]);

  const kind = offerKind(event);
  if (gone || state !== 'PENDING' || !kind) return null;

  const finish = (next: 'DISMISSED' | 'INSTALLED') => {
    saveInstallState(userId, next);
    setGone(true);
  };

  const dismiss = () => {
    // Focus goes to the next control in reading order, found before the card leaves the page.
    const card = cardRef.current;
    const next = card
      ? [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].find((el) => card.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !card.contains(el))
      : undefined;
    finish('DISMISSED');
    next?.focus();
  };

  const install = async () => {
    if (!event) return;
    const outcome = await promptInstall(event);
    if (outcome === 'accepted') {
      finish('INSTALLED');
      announce(t('install.done'));
    } else finish('DISMISSED');
  };

  return (
    <section
      ref={cardRef}
      aria-labelledby={titleId}
      data-testid="install-card"
      className="flex flex-col gap-1 rounded-lg border-[1.5px] border-ink bg-card p-4"
    >
      <p id={titleId} className="text-body font-bold">
        {kind === 'ios' ? t('install.ios') : t('install.benefit')}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {kind === 'prompt' ? (
          <Button data-testid="install-button" onClick={() => void install()}>
            {t('install.button')}
          </Button>
        ) : null}
        <button
          type="button"
          data-testid="install-dismiss"
          onClick={dismiss}
          className="hit-target inline-flex min-h-target-min items-center px-2 text-body text-muted underline"
        >
          {kind === 'ios' ? t('install.gotIt') : t('install.notNow')}
        </button>
      </div>
    </section>
  );
}
