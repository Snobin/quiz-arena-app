import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n.ts';
import { session } from '../auth/session.ts';
import { syncFromLocation } from '../shell/router.ts';
import AdminApp from './AdminApp.tsx';

vi.mock('./QuestionEditor.tsx', () => ({ QuestionEditor: ({ questionId }: { questionId: string | null }) => <h1 tabIndex={-1}>{`Editor ${questionId ?? 'new'}`}</h1> }));
vi.mock('./QuestionsPage.tsx', () => ({ QuestionsPage: () => <h1 tabIndex={-1}>Questions</h1> }));

function renderAt(path: string) {
  window.history.pushState(null, '', path);
  syncFromLocation();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AdminApp />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  session.store.setState({ status: 'registered', name: 'Snobin', signedOut: false });
});

afterEach(() => {
  session.reset();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
});

describe('AdminApp', () => {
  it('shows four nav links with aria-current on the active one, and the signed-in name', () => {
    renderAt('/admin/drafts');
    const nav = screen.getByRole('navigation', { name: 'Admin sections' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Questions', 'Upload', 'Drafts', 'Reports']);
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent)).toEqual(['Drafts']);
    expect(screen.getByText('Signed in as Snobin')).toBeTruthy();
  });

  it('falls back to Questions for an unknown admin path', () => {
    renderAt('/admin/foo');
    expect(screen.getByRole('link', { name: 'Questions' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { name: 'Questions' })).toBeTruthy();
  });

  it('Sign out calls session.signOut and navigates to /', async () => {
    const signOut = vi.spyOn(session, 'signOut').mockResolvedValue();
    renderAt('/admin');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await act(async () => undefined);
    expect(signOut).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/');
  });

  it('renders the editor for /admin/questions/new and /admin/questions/:id/edit', () => {
    const first = renderAt('/admin/questions/new');
    expect(screen.getByRole('heading', { name: 'Editor new' })).toBeTruthy();
    first.unmount();
    renderAt('/admin/questions/abc/edit');
    expect(screen.getByRole('heading', { name: 'Editor abc' })).toBeTruthy();
  });

  it('renders the Upload page at /admin/upload', () => {
    renderAt('/admin/upload');
    expect(screen.getByRole('heading', { name: 'Upload questions' })).toBeTruthy();
    expect(screen.getByLabelText('CSV file')).toBeTruthy();
  });

  it('falls back to Questions for a malformed escape in the edit path', () => {
    renderAt('/admin/questions/%E0%A4%A/edit');
    expect(screen.getByRole('heading', { name: 'Questions' })).toBeTruthy();
  });
});
