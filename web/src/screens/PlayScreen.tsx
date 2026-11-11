import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '../design/BrandMark.tsx';
import { Button } from '../design/Button.tsx';
import { PageColumn } from '../design/PageColumn.tsx';
import { Lang } from '../i18n/Lang.tsx';
import { useDocumentTitle } from '../i18n/useDocumentTitle.ts';
import { usePlayAvailability } from '../shell/usePlayAvailability.ts';

/** RFC 9457 Problem Details, as returned by every service error. */
type ProblemDetail = {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
};

// The probe hits an unknown path on purpose: the expected answer is a 404 ProblemDetail from core.
const PROBE_PATH = '/api/core/v1/ping';

async function probeApi(): Promise<ProblemDetail> {
  const response = await fetch(PROBE_PATH);
  const isProblem = response.headers.get('content-type')?.startsWith('application/problem+json') ?? false;
  if (response.status !== 404 || !isProblem) {
    throw new Error(`Unexpected probe response: ${response.status}`);
  }
  return (await response.json()) as ProblemDetail;
}

/** Play (Home). Placeholder until Story 1.5: brand, tagline, API probe and a Quick Match stub. */
export function PlayScreen() {
  const { t } = useTranslation();
  useDocumentTitle();
  // Network errors, non-JSON bodies (e.g. a proxy error page) and unexpected statuses all reject.
  const probe = useQuery({ queryKey: ['scaffold-probe'], queryFn: probeApi, retry: false });
  const play = usePlayAvailability();

  return (
    <PageColumn className="justify-center">
      <main className="flex flex-col gap-2">
        <h1 tabIndex={-1} className="text-card-title font-card-title">
          <BrandMark />
        </h1>
        <p>{t('shell.tagline')}</p>
        <pre className="font-code text-code whitespace-pre-wrap text-muted">
          {probe.isSuccess ? (
            <Lang lang="en">{`${probe.data.status} ${probe.data.title ?? ''}`.trim()}</Lang>
          ) : probe.isError ? (
            t('shell.probe.unreachable')
          ) : (
            t('shell.probe.pending')
          )}
        </pre>
        <div className="flex flex-col items-start gap-1 pt-4">
          {/* Story 1.5 wires matchmaking; until then an online tap does nothing. */}
          {play.disabled ? (
            <Button disabled disabledReason={play.reason}>
              {t('play.quickMatch')}
            </Button>
          ) : (
            <Button>{t('play.quickMatch')}</Button>
          )}
        </div>
      </main>
    </PageColumn>
  );
}
