import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandMark } from './design/BrandMark.tsx';
import { PageColumn } from './design/PageColumn.tsx';
import { Lang } from './i18n/Lang.tsx';
import { useDocumentTitle } from './i18n/useDocumentTitle.ts';

// Dev-only fixtures at /__design and /__shaping. `import.meta.env.DEV` is a build-time constant,
// so the fixtures are dropped from production bundles entirely.
const DesignFixture = import.meta.env.DEV ? lazy(() => import('./design/DesignFixture.tsx')) : null;
const ShapingFixture = import.meta.env.DEV ? lazy(() => import('./design/ShapingFixture.tsx')) : null;

/** True at `<base><route>` (with or without a trailing slash), whatever the app's base URL. */
function isFixtureRoute(route: '/__design' | '/__shaping'): boolean {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  let path = window.location.pathname;
  if (base && path.startsWith(`${base}/`)) path = path.slice(base.length);
  return path.replace(/\/+$/, '') === route;
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
  const Fixture =
    DesignFixture && isFixtureRoute('/__design')
      ? DesignFixture
      : ShapingFixture && isFixtureRoute('/__shaping')
        ? ShapingFixture
        : null;
  if (Fixture) {
    return (
      <Suspense fallback={null}>
        <Fixture />
      </Suspense>
    );
  }
  return <Shell />;
}

function Shell() {
  const { t } = useTranslation();
  useDocumentTitle();
  // Network errors, non-JSON bodies (e.g. a proxy error page) and unexpected statuses all reject.
  const probe = useQuery({ queryKey: ['scaffold-probe'], queryFn: probeApi, retry: false });

  return (
    <PageColumn className="justify-center">
      <main className="flex flex-col gap-2">
        <h1 className="text-card-title font-card-title">
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
      </main>
    </PageColumn>
  );
}
