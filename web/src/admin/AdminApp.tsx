import { useEffect } from 'react';
import { useSession, session } from '../auth/session.ts';
import { LiveRegions } from '../shell/LiveRegions.tsx';
import { Link } from '../shell/Link.tsx';
import { navigate, usePathname } from '../shell/router.ts';
import { adminT, registerAdminStrings, type AdminKey } from './adminI18n.ts';
import { Placeholder } from './Placeholder.tsx';
import { QuestionEditor } from './QuestionEditor.tsx';
import { QuestionsPage } from './QuestionsPage.tsx';

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
      return <Placeholder heading="nav.upload" message="placeholder.upload" />;
    case '/admin/drafts':
      return <Placeholder heading="nav.drafts" message="placeholder.drafts" />;
    case '/admin/reports':
      return <Placeholder heading="nav.reports" message="placeholder.reports" />;
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

  // After a route change focus moves to the page heading, so screen-reader users hear the new page.
  useEffect(() => {
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [pathname]);

  const signOut = () => {
    void session.signOut().then(() => navigate('/'));
  };

  return (
    <div data-admin-console={adminChunkMarker} className="min-h-dvh bg-paper text-ink">
      <LiveRegions />
      <header className="flex items-center justify-between border-b border-hairline bg-card px-gutter-text py-2">
        <span className="font-title text-title">{adminT('brand.admin')}</span>
        <div className="flex items-center gap-4">
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
                {adminT(item.label)}
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
