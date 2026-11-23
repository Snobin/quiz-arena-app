import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
import { RECENT_TOPICS_PATH, TOPICS_PATH } from '../topics/topicsApi.ts';
import { loadRecentRooms, saveRecentRoom } from './recentRooms.ts';
import { resetRoomClient } from './roomClient.ts';
import { ROOM_CREATE, ROOM_JOIN, roomStart } from './roomProtocol.ts';

const USER_ID = '5d8f0f5e-0000-4000-8000-000000000001';
const ROOM_ID = '8e9f0a1b-2c3d-4e5f-a6b7-c8d9e0f1a2b3';
const SELF = '0b7e9c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d';
const BIJU = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';
const BIG = '6f1b2c3d-1111-4222-8333-444455556666';
const MID = '6f1b2c3d-1111-4222-8333-444455557777';
const SMALL = '6f1b2c3d-1111-4222-8333-444455558888';
const LIST_PATH = '/api/core/v1/me/custom-topics';

vi.setConfig({ testTimeout: 20_000 });

const TOPICS = [
  { customTopicId: BIG, name: 'Renaissance', questionCount: 40, updatedAt: '2026-11-11T10:00:00Z' },
  { customTopicId: MID, name: 'ഭരണഘടന', questionCount: 8, updatedAt: '2026-11-10T10:00:00Z' },
  { customTopicId: SMALL, name: 'Tiny', questionCount: 3, updatedAt: '2026-11-09T10:00:00Z' },
];

let online = true;
let clients: FakeStomp[];
let calls: string[] = [];
const socket = () => clients[clients.length - 1]!;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function stubCore(topics = TOPICS) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === REFRESH_PATH) return jsonResponse({ accessToken: utf8Jwt({ sub: USER_ID, name: 'Rajeev' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Rajeev', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      if (url === TOPICS_PATH) return jsonResponse({ category: 'KERALA_PSC', minQuestions: 10, subjects: [{ subjectId: 's1', name: 'History', topics: [{ topicId: 't1', name: 'Kerala History', publishedCount: 40 }] }] });
      if (url === RECENT_TOPICS_PATH) return jsonResponse([]);
      if (url === LIST_PATH) return jsonResponse({ usage: { topics: 3, questions: 51, topicCap: 50, questionCap: 500, warn: false }, topics });
      if (url === `${LIST_PATH}/${BIG}`) {
        const questions = Array.from({ length: 40 }, (_, i) => ({ position: i + 1, text: `Q${i}`, lang: 'en', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'x' }));
        return jsonResponse({ customTopicId: BIG, name: 'Renaissance', questionCount: 40, revision: 1, updatedAt: '2026-11-11T10:00:00Z', questions });
      }
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

async function boot(topics = TOPICS) {
  stubCore(topics);
  session.start();
  await session.ready();
}

const customRoom = (over: { count?: number; role?: 'HOST' | 'MEMBER'; humans?: number } = {}) => {
  const people = [
    { participantId: SELF, displayName: 'Rajeev', kind: 'USER' },
    { participantId: BIJU, displayName: 'Biju', kind: 'USER' },
  ].slice(0, over.humans ?? 1);
  return {
    hostParticipantId: SELF,
    source: { type: 'CUSTOM', customTopicId: BIG, topicName: 'Renaissance' },
    questionCount: over.count ?? 10,
    rated: false,
    expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
    participants: people,
    humanCount: people.length,
  };
};
const joined = (over: { count?: number; role?: 'HOST' | 'MEMBER'; humans?: number } = {}) => ({
  type: 'ROOM_JOINED',
  roomId: ROOM_ID,
  refSeq: 0,
  serverTime: SERVER_TIME,
  payload: {
    roomId: ROOM_ID,
    code: 'K7MQ2X',
    role: over.role ?? 'HOST',
    selfParticipantId: over.role === 'MEMBER' ? BIJU : SELF,
    room: customRoom(over),
  },
});

beforeEach(async () => {
  online = true;
  localStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  clients = useFakeRealtime();
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  resetRoomClient();
  resetRealtime();
  session.reset();
  guestSession.reset();
  resetProfile();
  clearReturnFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.dispatchEvent(new Event('online'));
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  document.title = '';
  await act(() => i18n.changeLanguage('ml'));
});

async function answerCreate(message: unknown) {
  await waitFor(() => expect(clients.length).toBeGreaterThan(0));
  await flush();
  socket().open();
  await waitFor(() => expect(socket().sentTo(ROOM_CREATE)).toBe(1));
  act(() => socket().deliver(message));
}

describe('the room picker with My topics', () => {
  it('lists only topics with 5 or more questions, says why the others are missing and returns the pick to Create', async () => {
    await boot();
    const user = userEvent.setup();
    renderApp('/play/topics?for=room&count=12');
    const mine = await screen.findByTestId('my-topics', undefined, { timeout: 8000 });
    expect(screen.getByRole('heading', { level: 2, name: 'My topics' })).toBeInTheDocument();
    expect(within(mine).getByText('40 questions · unrated')).toBeInTheDocument();
    expect(within(mine).getByText('8 questions · unrated')).toBeInTheDocument();
    expect(within(mine).queryByText('Tiny')).toBeNull();
    expect(screen.getByTestId('my-topics-hidden')).toHaveTextContent("Topics with fewer than 5 questions can't be used in a room");

    await user.click(within(mine).getByRole('button', { name: /ഭരണഘടന/ }));
    await waitFor(() => expect(window.location.pathname).toBe('/rooms/create'));
    const params = new URLSearchParams(window.location.search);
    expect(params.get('customTopicId')).toBe(MID);
    // 12 asked, the topic has 8: lowered to its size.
    expect(params.get('count')).toBe('8');
  });

  it('is not offered in the Topic Duel picker', async () => {
    await boot();
    renderApp('/play/topics?for=duel');
    await screen.findByRole('heading', { level: 2, name: 'History' }, { timeout: 8000 });
    expect(screen.queryByTestId('my-topics')).toBeNull();
    expect(calls).not.toContain(LIST_PATH);
  });
});

describe('Create with a custom topic', () => {
  it('shows the name, the own tag and the unrated note, and sends a CUSTOM source with the topic name', async () => {
    await boot();
    const user = userEvent.setup();
    renderApp(`/rooms/create?customTopicId=${BIG}&count=20`);
    const row = await screen.findByTestId('custom-source', undefined, { timeout: 8000 });
    expect(within(row).getByText('Renaissance')).toBeInTheDocument();
    expect(within(row).getByTestId('own-tag')).toHaveTextContent('Own');
    expect(within(row).getByText("Unrated · the host's own questions don't change ratings")).toBeInTheDocument();
    expect(row).toHaveAccessibleName('Renaissance, own topic, unrated');
    expect(screen.getByTestId('count-value')).toHaveTextContent('20');

    await user.click(screen.getByRole('button', { name: 'Create room' }));
    await waitFor(() => expect(socket()).toBeDefined());
    await answerCreate(joined({ count: 20 }));
    expect(socket().bodiesTo(ROOM_CREATE)).toEqual([{ source: { type: 'CUSTOM', customTopicId: BIG, topicName: 'Renaissance' }, questionCount: 20 }]);
    await screen.findByRole('heading', { level: 1, name: 'Battle Room' });
    expect(loadRecentRooms(USER_ID)[0]).toMatchObject({ source: { type: 'CUSTOM', customTopicId: BIG }, topicName: 'Renaissance', questionCount: 20 });
  });

  it('lowers a count above the topic size and announces it politely', async () => {
    await boot();
    renderApp(`/rooms/create?customTopicId=${MID}&count=25`);
    await screen.findByTestId('custom-source', undefined, { timeout: 8000 });
    await waitFor(() => expect(screen.getByTestId('count-value')).toHaveTextContent('8'));
    await waitFor(() => expect(useAnnouncements.getState().polite.text).toMatch(/\b8\b/));
  });

  it('a custom topic under 5 questions, or one not in her list, is "Choose a topic first"', async () => {
    await boot();
    renderApp(`/rooms/create?customTopicId=${SMALL}&count=10`);
    await screen.findByText('Choose a topic first', undefined, { timeout: 8000 });
    expect(screen.getByRole('button', { name: 'Create room' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('the lobby on a custom topic', () => {
  it('a player sees the same source row and never asks for the topic list', async () => {
    await boot();
    renderApp('/r/K7M-Q2X');
    await waitFor(() => expect(clients.length).toBeGreaterThan(0), { timeout: 8000 });
    await flush();
    socket().open();
    await waitFor(() => expect(socket().sentTo(ROOM_JOIN)).toBe(1));
    act(() => socket().deliver(joined({ role: 'MEMBER', humans: 2 })));
    const row = await screen.findByTestId('custom-source');
    expect(row).toHaveAccessibleName('Renaissance, own topic, unrated');
    expect(within(row).getByTestId('own-tag')).toBeInTheDocument();
    expect(screen.getByText('Waiting for Rajeev to start')).toBeInTheDocument();
    expect(calls).not.toContain(LIST_PATH);
  });

  async function hostLobby() {
    renderApp(`/rooms/create?customTopicId=${BIG}&count=10`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Create room' }, { timeout: 8000 }));
    await answerCreate(joined({ humans: 1 }));
    await screen.findByRole('heading', { level: 1, name: 'Battle Room' });
    act(() => socket().deliverRoomTopic(ROOM_ID, { type: 'ROOM_LOBBY_UPDATED', roomId: ROOM_ID, seq: 1, serverTime: SERVER_TIME, payload: { room: customRoom({ humans: 2 }), joined: [BIJU], left: [] } }));
    await screen.findByRole('heading', { level: 2, name: '2 joined' });
    return user;
  }

  it('a topic that no longer exists tells the host so, with Change topic, and no raw error', async () => {
    await boot();
    const user = await hostLobby();
    await user.click(screen.getByRole('button', { name: 'Start · 2 players' }));
    expect(socket().sentTo(roomStart(ROOM_ID))).toBe(1);
    act(() => socket().deliverRoomTopic(ROOM_ID, { type: 'ROOM_START_FAILED', roomId: ROOM_ID, seq: 2, serverTime: SERVER_TIME, payload: { reason: 'SOURCE_UNAVAILABLE' } }));
    expect(await screen.findByText('That topic no longer exists. Choose another one.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change topic' }).getAttribute('href')).toContain(ROOM_ID);
    expect(screen.queryByText(/404/)).toBeNull();
  });

  it('a topic that shrank below the count says so with the count and offers Change topic', async () => {
    await boot();
    const user = await hostLobby();
    await user.click(screen.getByRole('button', { name: 'Start · 2 players' }));
    act(() => socket().deliverRoomTopic(ROOM_ID, { type: 'ROOM_START_FAILED', roomId: ROOM_ID, seq: 2, serverTime: SERVER_TIME, payload: { reason: 'TOPIC_UNAVAILABLE' } }));
    expect(await screen.findByText('That topic now has fewer than 10 questions. Lower the count or choose another topic.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change topic' })).toBeInTheDocument();
  });
});

describe('recently hosted and the topic view', () => {
  it('shows a custom room with the tag, and hides one whose topic is gone or now under 5 questions', async () => {
    await boot();
    const entry = (customTopicId: string, name: string, hostedAt: string) => ({
      source: { type: 'CUSTOM' as const, customTopicId },
      topicName: name,
      subjectName: '',
      questionCount: 10,
      hostedAt,
    });
    saveRecentRoom(USER_ID, entry('6f1b2c3d-9999-4222-8333-444455556666', 'Deleted', '2026-11-01T10:00:00.000Z'));
    saveRecentRoom(USER_ID, entry(SMALL, 'Tiny', '2026-11-05T10:00:00.000Z'));
    saveRecentRoom(USER_ID, entry(BIG, 'Renaissance', '2026-11-11T10:00:00.000Z'));
    const user = userEvent.setup();
    renderApp('/rooms');
    const link = await screen.findByRole('link', { name: /Renaissance/ }, { timeout: 8000 });
    expect(within(link).getByTestId('own-tag')).toBeInTheDocument();
    expect(screen.queryByText('Deleted')).toBeNull();
    expect(screen.queryByText('Tiny')).toBeNull();
    await user.click(link);
    expect(window.location.pathname).toBe('/rooms/create');
    expect(new URLSearchParams(window.location.search).get('customTopicId')).toBe(BIG);
  });

  it('"Use in Battle Room" opens Create with the topic and the whole topic up to 30 as the count', async () => {
    await boot();
    const user = userEvent.setup();
    renderApp(`/me/custom-topics/${BIG}`);
    await user.click(await screen.findByRole('button', { name: 'Use in Battle Room' }, { timeout: 8000 }));
    expect(window.location.pathname).toBe('/rooms/create');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('customTopicId')).toBe(BIG);
    expect(params.get('count')).toBe('30');
  });
});
