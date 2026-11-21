import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import i18n from '../../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import { resetRealtime } from '../../realtime/connection.ts';
import { resetAnnouncements, useAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../../test-utils/guest.ts';
import { SERVER_TIME, useFakeRealtime, type FakeStomp } from '../../test-utils/realtime.ts';
import { RECENT_TOPICS_PATH, TOPICS_PATH, type Catalogue } from '../topics/topicsApi.ts';
import { loadRecentRooms, saveRecentRoom } from './recentRooms.ts';
import { resetRoomClient } from './roomClient.ts';
import { ROOM_CREATE, roomConfigure, roomLeave } from './roomProtocol.ts';

const USER_ID = '5d8f0f5e-0000-4000-8000-000000000001';
const KH_ID = '7c1f0c9a-1111-4a2b-8c3d-0e1f2a3b4c5d';
const FS_ID = '7c1f0c9a-2222-4a2b-8c3d-0e1f2a3b4c5d';
const RIV_ID = '7c1f0c9a-3333-4a2b-8c3d-0e1f2a3b4c5d';
const ROOM_ID = '8e9f0a1b-2c3d-4e5f-a6b7-c8d9e0f1a2b3';
const SELF = '0b7e9c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d';

const CATALOGUE: Catalogue = {
  category: 'KERALA_PSC',
  minQuestions: 10,
  subjects: [
    {
      subjectId: 's-hist',
      name: 'History',
      topics: [
        { topicId: KH_ID, name: 'Kerala History', publishedCount: 1240 },
        { topicId: FS_ID, name: 'Freedom Struggle', publishedCount: 12 },
      ],
    },
    { subjectId: 's-geo', name: 'ഭൂമിശാസ്ത്രം', topics: [{ topicId: RIV_ID, name: 'കേരളത്തിലെ നദികൾ', publishedCount: 30 }] },
  ],
};

vi.setConfig({ testTimeout: 20_000 });

let online = true;
let clients: FakeStomp[];

/** Gives `navigator` a share sheet and/or clipboard for one test (jsdom has neither). */
function stubNavigator(parts: { share?: unknown; clipboard?: unknown }) {
  for (const [name, value] of Object.entries(parts)) Object.defineProperty(navigator, name, { value, configurable: true });
}
const socket = () => clients[clients.length - 1]!;

function stubCore(authed = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === REFRESH_PATH) {
        if (!authed) return jsonResponse({ status: 401 }, 401, 'application/problem+json');
        return jsonResponse({ accessToken: utf8Jwt({ sub: USER_ID, name: 'Rajeev' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      }
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Rajeev', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      if (url === TOPICS_PATH) return jsonResponse(CATALOGUE);
      if (url === RECENT_TOPICS_PATH) return jsonResponse([]);
      if (url.startsWith(`${RECENT_TOPICS_PATH}/`)) return new Response(null, { status: 204 });
      return jsonResponse({ status: 404 }, 404, 'application/problem+json');
    }),
  );
}

function renderApp(path: string) {
  window.history.pushState(null, '', path);
  syncFromLocation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

async function boot(authed = true) {
  stubCore(authed);
  session.start();
  await session.ready();
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const joinedMessage = (over: { topicId?: string; count?: number; expiresAt?: string } = {}) => ({
  type: 'ROOM_JOINED',
  roomId: ROOM_ID,
  refSeq: 0,
  serverTime: SERVER_TIME,
  payload: {
    roomId: ROOM_ID,
    code: 'K7MQ2X',
    role: 'HOST',
    selfParticipantId: SELF,
    room: {
      hostParticipantId: SELF,
      source: { type: 'BANK', topicId: over.topicId ?? KH_ID },
      questionCount: over.count ?? 10,
      rated: true,
      expiresAt: over.expiresAt ?? new Date(Date.now() + 24 * 3600_000).toISOString(),
      participants: [{ participantId: SELF, displayName: 'Rajeev', kind: 'USER' }],
      humanCount: 1,
    },
  },
});

/** Opens the host socket the create made, and answers it. */
async function answerCreate(message: unknown) {
  await waitFor(() => expect(clients.length).toBeGreaterThan(0));
  await flush();
  socket().open();
  await waitFor(() => expect(socket().sentTo(ROOM_CREATE)).toBe(1));
  act(() => socket().deliver(message));
}

beforeEach(async () => {
  online = true;
  localStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  clients = useFakeRealtime();
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  for (const name of ['share', 'clipboard']) Reflect.deleteProperty(navigator, name);
  resetRoomClient();
  resetRealtime();
  session.reset();
  guestSession.reset();
  resetProfile();
  clearReturnFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // react-query remembers an `offline` event until it sees `online`.
  window.dispatchEvent(new Event('online'));
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  document.title = '';
  await act(() => i18n.changeLanguage('ml'));
});

describe('the Rooms tab', () => {
  it('shows the heading, Create room, an inert Join with code and no Recently hosted when there are none', async () => {
    await boot();
    renderApp('/rooms');
    expect(await screen.findByRole('heading', { level: 1, name: 'Rooms' }, { timeout: 8000 })).toBeInTheDocument();
    expect(document.title).toBe('Rooms · Minnal');
    expect(screen.getByRole('button', { name: 'Create room' })).not.toHaveAttribute('aria-disabled');
    const field = screen.getByLabelText('Room code');
    expect(field).toHaveAttribute('autocapitalize', 'characters');
    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(field).toHaveAttribute('spellcheck', 'false');
    const join = screen.getByRole('button', { name: 'Join' });
    expect(join).toHaveAttribute('aria-disabled', 'true');
    expect(join).toHaveAccessibleDescription('Joining arrives soon');
    expect(screen.queryByText('Recently hosted')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('lists up to 3 recently hosted rooms newest first, hides a topic that is no longer listed, and reopens one on Create', async () => {
    await boot();
    const entry = (topicId: string, name: string, hostedAt: string, questionCount: number) => ({
      source: { type: 'BANK' as const, topicId },
      topicName: name,
      subjectName: 'History',
      questionCount,
      hostedAt,
    });
    saveRecentRoom(USER_ID, entry('gone-topic', 'Withdrawn', '2026-11-01T10:00:00.000Z', 10));
    saveRecentRoom(USER_ID, entry(FS_ID, 'Freedom Struggle', '2026-11-05T10:00:00.000Z', 10));
    saveRecentRoom(USER_ID, entry(KH_ID, 'Kerala History', '2026-11-11T10:00:00.000Z', 15));
    const user = userEvent.setup();
    renderApp('/rooms');
    expect(await screen.findByRole('heading', { level: 2, name: 'Recently hosted' }, { timeout: 8000 })).toBeInTheDocument();
    const rows = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/rooms/create'));
    expect(rows.map((r) => within(r).getByText(/·/).textContent)).toEqual(['15 questions · 11 Nov', '10 questions · 5 Nov']);
    expect(screen.queryByText('Withdrawn')).toBeNull();
    await user.click(rows[0]!);
    expect(window.location.pathname).toBe('/rooms/create');
    expect(new URLSearchParams(window.location.search).get('topicId')).toBe(KH_ID);
    expect(await screen.findByText('Kerala History')).toBeInTheDocument();
    expect(screen.getByTestId('count-value')).toHaveTextContent('15');
  });

  it('shows a guest one line and one Sign-in nudge, and sends /rooms/create to Sign-in with it as returnTo', async () => {
    await boot(false);
    renderApp('/rooms');
    expect(await screen.findByRole('heading', { level: 1, name: 'Rooms' })).toBeInTheDocument();
    expect(screen.getAllByTestId('sign-in-nudge')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Create room' })).toBeNull();
  });

  it('a guest opening /rooms/create goes to Sign-in with that route as returnTo', async () => {
    await boot(false);
    renderApp('/rooms/create');
    await waitFor(() => expect(window.location.pathname).toBe('/sign-in'), { timeout: 8000 });
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/rooms/create');
  });
});

describe('Create room', () => {
  it('starts with no source, "Choose a topic first" and an aria-disabled Create', async () => {
    await boot();
    renderApp('/rooms/create');
    expect(await screen.findByRole('heading', { level: 1, name: 'Create room' }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a topic' })).toHaveAttribute('href', '/play/topics?for=room&count=10');
    const create = screen.getByRole('button', { name: 'Create room' });
    expect(create).toHaveAttribute('aria-disabled', 'true');
    expect(create).toHaveAccessibleDescription('Choose a topic first');
    expect(screen.getByTestId('count-value')).toHaveTextContent('10');
  });

  it('picks a topic in the picker for rooms and comes back to Create with it set', async () => {
    await boot();
    const user = userEvent.setup();
    renderApp('/rooms/create');
    await user.click(await screen.findByRole('link', { name: 'Choose a topic' }, { timeout: 8000 }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Battle Room · choose a topic' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Freedom Struggle, History, 12 questions' }));
    await waitFor(() => expect(window.location.pathname).toBe('/rooms/create'));
    expect(new URLSearchParams(window.location.search).get('topicId')).toBe(FS_ID);
    expect(await screen.findByText('Freedom Struggle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create room' })).not.toHaveAttribute('aria-disabled');
  });

  it('caps the stepper at 5 and the topic size, with captions, and lowers a larger count once, politely', async () => {
    await boot();
    const user = userEvent.setup();
    renderApp(`/rooms/create?topicId=${FS_ID}&count=25`);
    // 25 is more than this topic's 12 questions.
    await waitFor(() => expect(screen.getByTestId('count-value')).toHaveTextContent('12'), { timeout: 8000 });
    expect(useAnnouncements.getState().polite.text.trim()).toBe('This topic has 12 questions, so the count is now 12');
    const more = screen.getByRole('button', { name: 'More questions' });
    expect(more).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('This topic has 12 questions')).toBeInTheDocument();
    await user.click(more);
    expect(screen.getByTestId('count-value')).toHaveTextContent('12');
    const less = screen.getByRole('button', { name: 'Fewer questions' });
    for (let i = 0; i < 7; i++) await user.click(less);
    expect(screen.getByTestId('count-value')).toHaveTextContent('5');
    expect(less).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('At least 5 questions')).toBeInTheDocument();
    await user.click(less);
    expect(screen.getByTestId('count-value')).toHaveTextContent('5');
  });

  it('creates the room, saves a recent entry and opens the lobby with no tab bar', async () => {
    await boot();
    const user = userEvent.setup();
    renderApp(`/rooms/create?topicId=${KH_ID}&count=12`);
    await user.click(await screen.findByRole('button', { name: 'Create room' }, { timeout: 8000 }));
    await answerCreate(joinedMessage({ count: 12 }));
    expect(socket().bodiesTo(ROOM_CREATE)).toEqual([{ source: { type: 'BANK', topicId: KH_ID }, questionCount: 12 }]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Battle Room' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/r/K7M-Q2X');
    expect(document.title).toBe('Battle Room · K7M-Q2X · Minnal');
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    const saved = loadRecentRooms(USER_ID);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ source: { type: 'BANK', topicId: KH_ID }, topicName: 'Kerala History', subjectName: 'History', questionCount: 12 });
  });

  it('shows a failed create inline and keeps the chosen values', async () => {
    await boot();
    const user = userEvent.setup();
    renderApp(`/rooms/create?topicId=${KH_ID}&count=12`);
    await user.click(await screen.findByRole('button', { name: 'Create room' }, { timeout: 8000 }));
    await answerCreate({ type: 'ERROR', serverTime: SERVER_TIME, payload: { code: 'INVALID_ROOM_CONFIG' } });
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't create the room. Try again.");
    expect(window.location.pathname).toBe('/rooms/create');
    expect(screen.getByTestId('count-value')).toHaveTextContent('12');
    expect(screen.getByText('Kerala History')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create room' })).not.toHaveAttribute('aria-disabled');
    expect(loadRecentRooms(USER_ID)).toEqual([]);
  });

  it('a stale PROFILE_REQUIRED links to profile setup, and returns here afterwards', async () => {
    await boot();
    const user = userEvent.setup();
    renderApp(`/rooms/create?topicId=${KH_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Create room' }, { timeout: 8000 }));
    await answerCreate({ type: 'ERROR', serverTime: SERVER_TIME, payload: { code: 'PROFILE_REQUIRED' } });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Finish your profile to create a room.');
    const link = within(alert).getByRole('link', { name: 'Finish profile' });
    expect(new URLSearchParams(link.getAttribute('href')!.split('?')[1]).get('to')).toBe(`/rooms/create?topicId=${KH_ID}`);
  });

  it('offline, Create is aria-disabled with the offline caption', async () => {
    online = false;
    await boot();
    renderApp(`/rooms/create?topicId=${KH_ID}`);
    const create = await screen.findByRole('button', { name: 'Create room' }, { timeout: 8000 });
    expect(create).toHaveAttribute('aria-disabled', 'true');
    expect(create).toHaveAccessibleDescription('Rooms need an internet connection');
  });
});

async function openLobby(count = 10, topicId = KH_ID) {
  const user = userEvent.setup();
  renderApp(`/rooms/create?topicId=${topicId}&count=${count}`);
  await user.click(await screen.findByRole('button', { name: 'Create room' }, { timeout: 8000 }));
  await answerCreate(joinedMessage({ count, topicId }));
  await screen.findByRole('heading', { level: 1, name: 'Battle Room' });
  return user;
}

describe('the host lobby', () => {
  it('shows the top bar, the code in room-code type with a spelled name, the expiry, the config card, the joined chip and the disabled start bar', async () => {
    await boot();
    await openLobby();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    expect(screen.getByText('Host')).toBeInTheDocument();
    const code = screen.getByText('K7M-Q2X');
    expect(code.className).toContain('font-room-code');
    expect(code).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Room code: K 7 M, Q 2 X')).toBeInTheDocument();
    expect(screen.getByText(/^expires (tomorrow )?\d{1,2}:\d{2} (am|pm)$/)).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Room settings' });
    expect(within(card).getByText('Kerala History')).toBeInTheDocument();
    expect(within(card).getByText('History')).toBeInTheDocument();
    expect(within(card).getByText('10 questions')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Edit topic' })).toHaveAttribute('href', `/play/topics?for=room&roomId=${ROOM_ID}&count=10`);
    expect(screen.getByRole('heading', { level: 2, name: '1 joined' })).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'Start · 1 player' });
    expect(start).toHaveAttribute('aria-disabled', 'true');
    expect(start).toHaveAccessibleDescription('Waiting for 1 more player');
    expect(screen.getByText('Leaving closes the room')).toBeInTheDocument();
    // No volt anywhere in the lobby.
    expect(document.body.innerHTML).not.toMatch(/volt|flash/);
  });

  it('shows a topic that is no longer listed with a generic label', async () => {
    await boot();
    await openLobby(10, FS_ID);
    // The lobby reads the topic from the catalogue; swap in a room whose topic is not in it.
    act(() => socket().deliver(joinedMessage({ topicId: '7c1f0c9a-9999-4a2b-8c3d-0e1f2a3b4c5d' })));
    expect(await screen.findByText('PSC topic')).toBeInTheDocument();
  });

  it('Share calls navigator.share with the text and a link from the configured origin', async () => {
    await boot();
    const share = vi.fn(async () => undefined);
    stubNavigator({ share });
    const user = await openLobby();
    await user.click(screen.getByRole('button', { name: 'Share to WhatsApp' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Minnal Battle Room',
      text: 'Join my Minnal Battle Room · K7M-Q2X',
      url: `${window.location.origin}/r/K7M-Q2X`,
    });
  });

  it('copies the text and link and says "Copied" where there is no share sheet', async () => {
    await boot();
    const user = await openLobby();
    const writeText = vi.fn(async () => undefined);
    stubNavigator({ share: undefined, clipboard: { writeText } });
    await user.click(screen.getByRole('button', { name: 'Share to WhatsApp' }));
    expect(writeText).toHaveBeenCalledWith(`Join my Minnal Battle Room · K7M-Q2X\n${window.location.origin}/r/K7M-Q2X`);
    expect(await within(screen.getByRole('main')).findByText('Copied')).toBeInTheDocument();
    expect(useAnnouncements.getState().polite.text.trim()).toBe('Copied');
  });

  it('copy-code writes the code, shows "Copied" and announces it once; a refused clipboard selects the code', async () => {
    await boot();
    const user = await openLobby();
    const writeText = vi.fn(async () => undefined);
    stubNavigator({ clipboard: { writeText } });
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('K7M-Q2X');
    expect(await within(screen.getByRole('main')).findByText('Copied')).toBeInTheDocument();

    stubNavigator({ clipboard: { writeText: async () => Promise.reject(new Error('denied')) } });
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
    expect(window.getSelection()?.toString()).toBe('K7M-Q2X');
  });

  it('offline, Share is aria-disabled with the offline caption', async () => {
    await boot();
    await openLobby();
    act(() => {
      online = false;
      window.dispatchEvent(new Event('offline'));
    });
    const share = await screen.findByRole('button', { name: 'Share to WhatsApp' });
    await waitFor(() => expect(share).toHaveAttribute('aria-disabled', 'true'));
    expect(share).toHaveAccessibleDescription('Rooms need an internet connection');
  });

  it('Edit count opens the stepper and sends configure; the lobby re-renders from ROOM_LOBBY_UPDATED', async () => {
    await boot();
    const user = await openLobby();
    await user.click(screen.getByRole('button', { name: 'Edit question count' }));
    await user.click(screen.getByRole('button', { name: 'More questions' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(socket().bodiesTo(roomConfigure(ROOM_ID))).toEqual([{ questionCount: 11 }]);
    const update = { ...joinedMessage({ count: 11 }), type: 'ROOM_LOBBY_UPDATED', seq: 2 };
    (update as { payload: unknown }).payload = { room: joinedMessage({ count: 11 }).payload.room };
    act(() => socket().deliverRoomTopic(ROOM_ID, update));
    expect(await screen.findByText('11 questions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('Edit topic goes to the picker for this room, sends configure with the lowered count and returns to the lobby', async () => {
    await boot();
    const user = await openLobby(25);
    await user.click(screen.getByRole('link', { name: 'Edit topic' }));
    expect(window.location.pathname).toBe('/play/topics');
    expect(await screen.findByRole('heading', { level: 1, name: 'Battle Room · choose a topic' })).toBeInTheDocument();
    // The room stays alive while she is in the picker: the lobby leaving must not send `leave`.
    expect(socket().sentTo(roomLeave(ROOM_ID))).toBe(0);
    await user.click(await screen.findByRole('button', { name: 'Freedom Struggle, History, 12 questions' }));
    await waitFor(() => expect(socket().bodiesTo(roomConfigure(ROOM_ID))).toEqual([{ source: { type: 'BANK', topicId: FS_ID }, questionCount: 12 }]));
    await waitFor(() => expect(window.location.pathname).toBe('/r/K7M-Q2X'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Battle Room' })).toBeInTheDocument();
    expect(useAnnouncements.getState().polite.text.trim()).toBe('This topic has 12 questions, so the count is now 12');
  });

  it('shows a configure ERROR inline on the config card', async () => {
    await boot();
    const user = await openLobby();
    await user.click(screen.getByRole('button', { name: 'Edit question count' }));
    await user.click(screen.getByRole('button', { name: 'More questions' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    act(() => socket().deliver({ type: 'ERROR', serverTime: SERVER_TIME, payload: { code: 'INVALID_ROOM_CONFIG' } }));
    const card = screen.getByRole('region', { name: 'Room settings' });
    expect(await within(card).findByRole('alert')).toHaveTextContent("Couldn't save that change.");
  });

  it('Leave sends leave with no confirm and returns to the Rooms tab', async () => {
    await boot();
    const user = await openLobby();
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(socket().bodiesTo(roomLeave(ROOM_ID))).toHaveLength(1);
    await waitFor(() => expect(window.location.pathname).toBe('/rooms'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: 'Rooms' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('browser Back (Android back) leaves the same way', async () => {
    await boot();
    await openLobby();
    act(() => window.history.back());
    await waitFor(() => expect(socket().bodiesTo(roomLeave(ROOM_ID))).toHaveLength(1));
    await waitFor(() => expect(window.location.pathname).toBe('/rooms'));
  });

  it('ROOM_CLOSED EXPIRED returns to the Rooms tab with a polite one-line notice', async () => {
    await boot();
    await openLobby();
    act(() => socket().deliver({ type: 'ROOM_CLOSED', roomId: ROOM_ID, serverTime: SERVER_TIME, payload: { reason: 'EXPIRED' } }));
    await waitFor(() => expect(window.location.pathname).toBe('/rooms'));
    expect(await within(screen.getByRole('main')).findByText('That room expired.')).toBeInTheDocument();
    expect(useAnnouncements.getState().polite.text.trim()).toBe('That room expired.');
  });

  it('a reload on /r/<code> finds the room again through the socket', async () => {
    await boot();
    renderApp('/r/K7M-Q2X');
    await waitFor(() => expect(clients.length).toBeGreaterThan(0), { timeout: 8000 });
    await flush();
    socket().open();
    act(() => socket().deliver(joinedMessage()));
    expect(await screen.findByRole('heading', { level: 1, name: 'Battle Room' })).toBeInTheDocument();
  });

  it('a shared link to a room that is not hers says joining arrives soon at once, with a way back', async () => {
    await boot();
    renderApp('/r/ABCDEF');
    await waitFor(() => expect(clients.length).toBeGreaterThan(0), { timeout: 8000 });
    await flush();
    socket().open();
    act(() => socket().deliver(joinedMessage()));
    expect(await screen.findByText('Joining a room from a link arrives soon.')).toBeInTheDocument();
    expect(screen.queryByText('Connecting to your room…')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to Rooms' })).toHaveAttribute('href', '/rooms');
    expect(window.location.pathname).toBe('/r/ABCDEF');
  });

  it('tries to resume once per mount: a failed resume does not open a second socket', async () => {
    await boot();
    renderApp('/r/K7M-Q2X');
    await waitFor(() => expect(clients.length).toBe(1), { timeout: 8000 });
    await flush();
    act(() => socket().drop());
    expect(await screen.findByText('Joining a room from a link arrives soon.')).toBeInTheDocument();
    await flush();
    expect(clients).toHaveLength(1);
  });

  it('a modified click on Edit topic keeps the leave-on-Back behaviour', async () => {
    await boot();
    await openLobby();
    fireEvent.click(screen.getByRole('link', { name: 'Edit topic' }), { ctrlKey: true });
    act(() => window.history.back());
    await waitFor(() => expect(socket().bodiesTo(roomLeave(ROOM_ID))).toHaveLength(1));
  });

  it('shows a long Malayalam topic name without truncation, marked as Malayalam', async () => {
    await boot();
    await openLobby(10, RIV_ID);
    const name = screen.getByRole('region', { name: 'Room settings' }).querySelector('[lang="ml"]');
    expect(name).toHaveTextContent('കേരളത്തിലെ നദികൾ');
    expect(name!.className).toContain('break-words');
    expect(name!.className).not.toContain('truncate');
  });
});
