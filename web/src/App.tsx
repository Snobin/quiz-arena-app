import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandMark } from './design/BrandMark.tsx';
import { PageColumn } from './design/PageColumn.tsx';

// Dev-only design fixture at /__design. `import.meta.env.DEV` is a build-time constant, so the
// fixture is dropped from production bundles entirely.
const DesignFixture = import.meta.env.DEV ? lazy(() => import('./design/DesignFixture.tsx')) : null;

/** True at `<base>/__design` (with or without a trailing slash), whatever the app's base URL. */
function isDesignFixtureRoute(): boolean {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  let path = window.location.pathname;
  if (base && path.startsWith(`${base}/`)) path = path.slice(base.length);
  return path.replace(/\/+$/, '') === '/__design';
}

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

// Placeholder shell for Story 1.1, now on the design foundation. The real shell arrives in Story 1.5.
export function App() {
  if (DesignFixture && isDesignFixtureRoute()) {
    return (
      <Suspense fallback={null}>
        <DesignFixture />
      </Suspense>
    );
  }
  return <Shell />;
}

function Shell() {
  const { t } = useTranslation();
  // Network errors, non-JSON bodies (e.g. a proxy error page) and unexpected statuses all reject.
  const probe = useQuery({ queryKey: ['scaffold-probe'], queryFn: probeApi, retry: false });

  return (
    <PageColumn className="justify-center">
      <main className="flex flex-col gap-2">
        <h1 className="text-card-title font-card-title">
          <BrandMark />
        </h1>
        <p>{t('shell.tagline')}</p>
        <pre lang="en" className="font-code text-code whitespace-pre-wrap text-muted">
          {probe.isSuccess
            ? `${probe.data.status} ${probe.data.title ?? ''}`.trim()
            : probe.isError
              ? 'API unreachable'
              : '…'}
        </pre>
      </main>
    </PageColumn>
  );
}
