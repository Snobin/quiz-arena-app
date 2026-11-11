import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

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

// Placeholder shell for Story 1.1. Design tokens and the real shell arrive in Stories 1.3 and 1.5.
export function App() {
  const { t } = useTranslation();
  // Network errors, non-JSON bodies (e.g. a proxy error page) and unexpected statuses all reject.
  const probe = useQuery({ queryKey: ['scaffold-probe'], queryFn: probeApi, retry: false });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-2 px-4">
      <h1 className="text-3xl font-bold">
        <span lang="en">Minnal</span>
      </h1>
      <p>{t('shell.tagline')}</p>
      <pre lang="en" className="text-sm opacity-70">
        {probe.isSuccess
          ? `${probe.data.status} ${probe.data.title ?? ''}`.trim()
          : probe.isError
            ? 'API unreachable'
            : '…'}
      </pre>
    </main>
  );
}
