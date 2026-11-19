import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { startGoogleSignIn } from '../../auth/googleSignIn.ts';
import { Button } from '../../design/Button.tsx';
import type { MessageKey } from '../../i18n/index.ts';
import type { ResultView } from './outcome.ts';

/** The results route a guest comes back to after signing in. Nothing about the match goes with it. */
export const RESULTS_RETURN = '/results';

/** Which of the four variants a result gets: a bot opponent first, else win, loss or draw. */
export function promptVariant(view: ResultView): 'win' | 'loss' | 'draw' | 'bot' {
  return view.rival?.kind === 'BOT' ? 'bot' : view.kind;
}

const KEYS: Record<ReturnType<typeof promptVariant>, MessageKey> = {
  win: 'results.prompt.win',
  loss: 'results.prompt.loss',
  draw: 'results.prompt.draw',
  bot: 'results.prompt.bot',
};

/**
 * The guest's registration prompt (UX-DR47, Story 2.4): an inline card in the Sign-in nudge style, built
 * from the match she just played. It is the only nudge on the results, never a modal, and it never
 * promises this match will be saved, rated or added to history. The button starts the Google sign-in with
 * `returnTo=/results`; no match id, score or guest id leaves the page.
 */
export function GuestResultsPrompt({ view }: { view: ResultView }) {
  const { t } = useTranslation();
  const titleId = useId();
  const name = view.winner?.displayName ?? view.rival?.displayName ?? '';
  // Without an opponent to name there is nothing honest to say: show no card.
  if (!name) return null;
  const text = t(KEYS[promptVariant(view)], { you: view.self.score, name });
  return (
    <section
      aria-labelledby={titleId}
      data-testid="results-sign-in-prompt"
      className="flex flex-col gap-1 rounded-lg border-[1.5px] border-ink bg-card p-4"
    >
      <h2 id={titleId} className="text-body font-bold">
        {t('results.prompt.title')}
      </h2>
      <p className="text-caption text-muted">{text}</p>
      <Button className="mt-2 w-full" onClick={() => startGoogleSignIn(RESULTS_RETURN)}>
        {t('signIn.google')}
      </Button>
    </section>
  );
}
