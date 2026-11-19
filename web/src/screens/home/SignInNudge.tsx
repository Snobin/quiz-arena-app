import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import { startGoogleSignIn } from '../../auth/googleSignIn.ts';
import { SignInOutcomeNote } from './SignInOutcomeNote.tsx';

export const NUDGE_BUTTON_ID = 'homeNudgeSignIn';

/**
 * The one Sign-in nudge on guest Home (UX-DR18): a card with a 1.5px ink outline, benefit text and
 * "Continue with Google". Decision (2026-11-12): the button is the secondary Button, not ink fill,
 * so the Quick Match card stays the only filled ink element. It starts the Google sign-in directly
 * and brings her back to Home.
 */
export function SignInNudge() {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-testid="sign-in-nudge"
      className="flex flex-col gap-1 rounded-lg border-[1.5px] border-ink bg-card p-4"
    >
      <h2 id={titleId} className="text-body font-bold">
        {t('nudge.title')}
      </h2>
      <p className="text-caption text-muted">{t('nudge.body')}</p>
      <SignInOutcomeNote />
      <Button id={NUDGE_BUTTON_ID} variant="secondary" className="mt-2 w-full" onClick={() => startGoogleSignIn('/')}>
        {t('signIn.google')}
      </Button>
    </section>
  );
}
