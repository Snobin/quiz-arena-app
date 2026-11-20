import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSession, session } from '../auth/session.ts';
import { LiveRegions } from '../shell/LiveRegions.tsx';
import { Link } from '../shell/Link.tsx';
import { navigate, usePathname } from '../shell/router.ts';
import { adminT, registerAdminStrings, type AdminKey } from './adminI18n.ts';
import { commitPending, hasReturnFocus, setReturnFocus } from './draftActions.ts';
import { DraftsPage } from './DraftsPage.tsx';
import { QuestionEditor } from './QuestionEditor.tsx';
import { QuestionsPage } from './QuestionsPage.tsx';
import { commitPendingReports } from './reportActions.ts';
import { ReportsPage } from './ReportsPage.tsx';
import { setShortcutsEnabled, useShortcuts } from './shortcuts.ts';
import { UploadPage } from './UploadPage.tsx';
import { fetchReportSummary } from './api.ts';

/** Marker the bundle check looks for: it must never appear in the entry chunk. */
const adminChunkMarker = 'minnal-admin-' + 'console';

registerAdminStrings();

const NAV: { to: string; label: AdminKey }[] = [
  { to: '/admin', label: 'nav.questions' },
  { to: '/admin/upload', label: 'nav.upload' },
  { to: '/admin/drafts', label: 'nav.drafts' },
  { to: '/admin/reports', label: 'nav.reports' },
];

const EDIT_PATH = /^\/admin\/questions\/([^/]+)\/edit$/;

/** The decoded id, or null for a malformed escape (the caller falls back to the Questions page). */
function safeDecode(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function Page({ pathname }: { pathname: string }) {
  if (pathname === '/admin/questions/new') return <QuestionEditor key="new" questionId={null} />;
  const edit = EDIT_PATH.exec(pathname);
  const id = edit ? safeDecode(edit[1] as string) : null;
  if (id) return <QuestionEditor key={id} questionId={id} />;
  switch (pathname) {
    case '/admin/upload':
      return <UploadPage />;
    case '/admin/drafts':
      return <DraftsPage />;
    case '/admin/reports':
      return <ReportsPage />;
    default:
      return <QuestionsPage />;
  }
}

/**
 * The admin console: a desktop layout with a top bar and a nav. It is loaded only through a dynamic import() from
 * the player bundle's guard, which has already checked the ADMIN role (the API checks it again on every call).
 */
export default function AdminApp() {
  const pathname = usePathname();
  const name = useSession((s) => s.name);
  const current = NAV.some((item) => item.to === pathname) ? pathname : '/admin';

  const shortcuts = useShortcuts((s) => s.enabled);
  const summary = useQuery({ queryKey: ['admin', 'reports', 'summary'], queryFn: fetchReportSummary, retry: false });
  const openReports = summary.data?.openCount ?? 0;

  // After a route change focus moves to the page heading, so screen-reader users hear the new page. Coming back to
  // the Drafts queue from the editor, the queue puts focus on the draft's row instead.
  useEffect(() => {
    if (pathname !== '/admin/drafts' && !EDIT_PATH.test(pathname)) setReturnFocus(null);
    if (pathname === '/admin/drafts' && hasReturnFocus()) return;
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [pathname]);

  // Moving elsewhere in the console, or out of it, sends any publish or discard still inside its 5 s Undo window.
  useEffect(
    () => () => {
      commitPending();
      commitPendingReports();
    },
    [pathname],
  );

  const signOut = () => {
    void session.signOut().then(() => navigate('/'));
  };

  return (
    <div data-admin-console={adminChunkMarker} className="min-h-dvh bg-paper text-ink">
      <LiveRegions />
      <header className="flex items-center justify-between border-b border-hairline bg-card px-gutter-text py-2">
        <span className="font-title text-title">{adminT('brand.admin')}</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            role="switch"
            aria-checked={shortcuts}
            onClick={() => setShortcutsEnabled(!shortcuts)}
            className="hit-target inline-flex min-h-target-min items-center gap-2 rounded-md px-2 text-body"
          >
            <span aria-hidden="true">{shortcuts ? '☑' : '☐'}</span>
            {adminT('shortcuts.switch')}
          </button>
          <span className="text-body text-muted">{adminT('bar.signedInAs', { name: name ?? adminT('bar.adminFallback') })}</span>
          <button
            type="button"
            onClick={signOut}
            className="hit-target inline-flex min-h-target-min items-center rounded-md border-[1.5px] border-ink bg-card px-4 text-body"
          >
            {adminT('bar.signOut')}
          </button>
        </div>
      </header>
      <nav aria-label={adminT('nav.label')} className="border-b border-hairline bg-card px-gutter-text">
        <ul className="flex gap-2">
          {NAV.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={item.to === current ? 'page' : undefined}
                className={[
                  'hit-target inline-flex min-h-target-min items-center rounded-md px-4 text-body',
                  item.to === current ? 'font-bold underline' : 'text-muted',
                ].join(' ')}
              >
                {item.to === '/admin/reports' && openReports > 0 ? adminT('nav.reportsCount', { count: openReports }) : adminT(item.label)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mx-auto w-full max-w-[1280px] px-gutter-text py-4">
        <Page pathname={pathname} />
      </div>
    </div>
  );
}
