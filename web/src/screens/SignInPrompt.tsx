import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../design/Button.tsx';
import { PageColumn } from '../design/PageColumn.tsx';
import { startGoogleSignIn } from '../auth/googleSignIn.ts';
import { useDocumentTitle } from '../i18n/useDocumentTitle.ts';
import { isPlainLeftClick, Link } from '../shell/Link.tsx';
import { cameFromApp, searchParam } from '../shell/router.ts';
import { SignInOutcomeNote } from './home/SignInOutcomeNote.tsx';
import { safeReturnPath } from './home/signInPath.ts';

/**
 * The Sign-in prompt (`/sign-in?returnTo=<path>`): an inline surface in the shell, never a modal.
 * "Continue with Google" starts the redirect sign-in (a full-page navigation, no popup), coming back
 * to `returnTo` through /auth/return.
 * Back is a link to `returnTo`; when the app pushed this entry it calls history.back() instead (so
 * browser Back and the link agree). AppShell then returns focus to the row or button that opened it.
 */
export function SignInPrompt() {
  const { t } = useTranslation();
  useDocumentTitle(t('title.signIn'));

  const returnTo = safeReturnPath(searchParam('returnTo'));
  // A real link to returnTo (works on a direct load); after an in-app tap it steps back instead,
  // so the prompt's entry doesn't linger in history.
  const back = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!cameFromApp() || !isPlainLeftClick(event)) return;
    event.preventDefault();
    window.history.back();
  };

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col items-start gap-3">
        <Link
          to={returnTo}
          replace
          onClick={back}
          className="hit-target inline-flex min-h-target-min items-center gap-1 rounded-md text-body font-semibold text-ink"
        >
          <span aria-hidden="true">←</span>
          {t('common.back')}
        </Link>
        <h1 tabIndex={-1} className="font-title text-title">
          {t('signIn.title')}
        </h1>
        <p>{t('nudge.body')}</p>
        <div className="flex w-full flex-col gap-1">
          <SignInOutcomeNote />
          <Button className="w-full" onClick={() => startGoogleSignIn(returnTo)}>
            {t('signIn.google')}
          </Button>
        </div>
      </main>
    </PageColumn>
  );
}
