import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import i18n from '../../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import { MATCH_PATH } from '../../ratings/ratingsApi.ts';
import { resetRealtime } from '../../realtime/connection.ts';
import { liveGameStore } from '../../realtime/liveGameStore.ts';
import { resetRoomClient } from '../rooms/roomClient.ts';
import { SERVER_TIME, useFakeRealtime, type FakeStomp } from '../../test-utils/realtime.ts';
import * as lastResult from '../../realtime/lastResult.ts';
import { parseMatchEnded } from '../../realtime/protocol.ts';
import { resetAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../../test-utils/guest.ts';
import { matchEnded } from '../../test-utils/realtime.ts';

/** Story 5.5: the Battle Room results, rehydrated from sessionStorage (the same path as a live arrival's screen). */

const MATCH_ID = 'm-room';
const NAMES = ['Fathima S', 'Biju', 'Anju', 'Devan', 'Chitra'];
const SCORES = [4610, 4610, 3960, 1200, 300];
const PLACEMENTS = [1, 1, 3, 4, 5];

function storeRoom(selfIndex: number, o: { forfeited?: number; source?: 'BANK' | 'CUSTOM' } = {}) {
  const ids = NAMES.map((_, i) => `p${i}`);
  const raw = matchEnded(MATCH_ID, {
    mode: 'BATTLE_ROOM',
    questionSource: o.source ?? 'BANK',
    participants: ids.map((participantId, i) => ({
      participantId,
      displayName: NAMES[i]!,
      kind: 'USER',
      score: SCORES[i]!,
      correctCount: 3,
      placement: PLACEMENTS[i]!,
      forfeited: i === o.forfeited,
    })),
    breakdown: Object.fromEntries(ids.map((id) => [id, [{ pickedIndex: 0, correct: true, responseMs: 2000, points: 100 }, { correct: false, points: 0 }]])),
    count: 2,
  }).payload as Record<string, unknown>;
  raw.room = { roomId: 'room-1', hostParticipantId: 'p0' };
  // A room on the host's own topic has a name only (Story 6.5b).
  raw.topic = o.source === 'CUSTOM' ? { name: 'Renaissance' } : { topicId: 't1', name: 'Kerala Renaissance', subjectName: 'History' };
  lastResult.save({ matchId: MATCH_ID, selfId: ids[selfIndex]!, payload: parseMatchEnded(raw)!, guest: false });
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

function stubCore(match: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === REFRESH_PATH) return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === MATCH_PATH(MATCH_ID)) return match();
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      return jsonResponse({ ratings: [], matches: [] });
    }),
  );
}

async function open(selfIndex: number, match: () => Response, o: Parameters<typeof storeRoom>[1] = {}) {
  stubCore(match);
  storeRoom(selfIndex, o);
  session.start();
  await session.ready();
  renderApp('/results');
}

const rated = (delta: number) => () =>
  jsonResponse({ matchId: MATCH_ID, mode: 'BATTLE_ROOM', rated: true, ratingBefore: 1200, ratingAfter: 1200 + delta, delta });

beforeEach(async () => {
  window.sessionStorage.clear();
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  resetRealtime();
  session.reset();
  guestSession.reset();
  resetProfile();
  clearReturnFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  await act(() => i18n.changeLanguage('ml'));
});

describe('Battle Room results', () => {
  it('a player who is not first lands on the settled view: "#3 of 5", her score, a grey delta, podium and standings', async () => {
    await open(2, rated(-6));
    const band = await screen.findByTestId('results-band');
    expect(within(band).getByTestId('results-line')).toHaveTextContent('#3 of 5');
    expect(within(band).getByTestId('results-self-score')).toHaveTextContent('3,960');
    expect(band).toHaveAttribute('data-result', 'loss');
    const delta = await screen.findByTestId('rating-delta');
    expect(delta).toHaveTextContent('-6');
    expect(delta).not.toHaveAttribute('data-accent');
    expect(screen.queryByTestId('takeover-bolt')).toBeNull();
    expect(screen.getAllByTestId('podium-column')).toHaveLength(3);
    expect(screen.getAllByTestId('results-standings-row')).toHaveLength(5);
    expect(screen.getByTestId('self-tag')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(/Place 3 of 5, 3,960 points, rating -6/));
    await waitFor(() => expect(document.title).toContain('Battle Room results'));
  });

  it('a joint winner has a volt chip delta and no takeover', async () => {
    await open(0, rated(11));
    const chip = await screen.findByTestId('rating-delta');
    expect(chip).toHaveAttribute('data-accent');
    expect(screen.getByTestId('results-line')).toHaveTextContent('#1 of 5');
    expect(screen.queryByTestId('takeover-bolt')).toBeNull();
  });

  it('holds the delta slot with no shift and says "updating" after 10 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    await open(2, () => jsonResponse({ status: 404 }, 404, 'application/problem+json'));
    const slot = await screen.findByTestId('rating-delta-slot');
    await act(async () => void (await vi.advanceTimersByTimeAsync(10_500)));
    expect(screen.getByTestId('rating-delta-slot')).toBe(slot);
    expect(screen.getByTestId('rating-delta-updating')).toHaveTextContent('updating');
  });

  it('shows Home and Share (no Rematch), and Home goes to the Home screen', async () => {
    await open(2, rated(-6));
    const bar = await screen.findByTestId('results-actions');
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Home', 'Share']);
    expect(screen.queryByTestId('rematch-button')).toBeNull();
    act(() => within(bar).getByRole('button', { name: 'Home' }).click());
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('a forfeiter appears in the standings with the "left" tag, ranked on her earned score', async () => {
    await open(2, rated(-6), { forfeited: 4 });
    await screen.findByTestId('results-band');
    const rows = screen.getAllByTestId('results-standings-row');
    expect(within(rows[4]!).getByTestId('left-tag')).toBeInTheDocument();
    expect(rows[4]).toHaveAttribute('aria-label', expect.stringContaining('Place 5, Chitra, 300 points'));
  });

  it('the breakdown has the room question count of dots', async () => {
    await open(2, rated(-6));
    expect(await screen.findByTestId('dot-strip')).toBeInTheDocument();
    expect(within(screen.getByTestId('dot-strip')).getAllByRole('listitem')).toHaveLength(2);
  });
});

/** Story 5.6: Play again for the host, the Join button for everyone else, and New room after the window. */
describe('Battle Room play again', () => {
  const SUCCEEDED = {
    code: 'K7M2QX',
    hostDisplayName: 'Fathima S',
    source: { type: 'BANK' as const, topicId: 't1' },
    questionCount: 2,
  };
  const joinedMessage = (role: string) => ({
    type: 'ROOM_JOINED',
    roomId: 'room-2',
    refSeq: 1,
    serverTime: SERVER_TIME,
    payload: {
      roomId: 'room-2',
      code: 'K7M2QX',
      role,
      selfParticipantId: 'p0',
      room: {
        hostParticipantId: 'p0',
        source: { type: 'BANK', topicId: 't1' },
        questionCount: 2,
        rated: true,
        expiresAt: '2026-11-13T10:15:30.123Z',
        participants: [{ participantId: 'p0', displayName: 'Fathima S', kind: 'USER' }],
        humanCount: 1,
      },
    },
  });
  let clients: FakeStomp[];

  beforeEach(() => {
    clients = useFakeRealtime();
  });

  afterEach(() => {
    resetRoomClient();
    liveGameStore.setState({ succeeded: null });
  });

  /** Moves the stored MATCH_ENDED back in time, as a reload after the window would find it. */
  function ageStored(ms: number) {
    const entry = JSON.parse(window.sessionStorage.getItem(lastResult.LAST_RESULT_KEY)!) as Record<string, number>;
    entry.endedAt = Date.now() - ms;
    window.sessionStorage.setItem(lastResult.LAST_RESULT_KEY, JSON.stringify(entry));
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('the host sees Play again (primary) and Home; a player sees Home alone until the successor arrives', async () => {
    await open(0, rated(11));
    const bar = await screen.findByTestId('results-actions');
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Play again', 'Home', 'Share']);
    expect(screen.queryByTestId('room-join-new')).toBeNull();
    expect(screen.queryByTestId('rematch-button')).toBeNull();
  });

  it('Play again sends playAgain for the finished room, opens the new lobby and refreshes the recent rooms', async () => {
    await open(0, rated(11));
    await screen.findByTestId('room-play-again');
    act(() => void screen.getByTestId('room-play-again').click());
    await act(flush);
    const socket = clients[clients.length - 1]!;
    socket.open();
    await act(flush);
    expect(socket.sentTo('/app/room/room-1/playAgain')).toBe(1);
    expect(screen.getByTestId('room-play-again')).toHaveAttribute('aria-busy', 'true');
    act(() => socket.deliver(joinedMessage('HOST')));
    await waitFor(() => expect(window.location.pathname).toBe('/r/K7M-2QX'));
    const stored = Object.entries(window.localStorage).find(([key]) => key.startsWith('minnal.recentRooms.'));
    expect(JSON.parse(stored![1])[0]).toMatchObject({ source: { topicId: 't1' }, topicName: 'Kerala Renaissance', questionCount: 2 });
  });

  it('after the window the host sees New room, which opens Create with the topic and count and tells no one', async () => {
    stubCore(rated(11));
    storeRoom(0);
    ageStored(61_000);
    session.start();
    await session.ready();
    renderApp('/results');
    const button = await screen.findByTestId('room-new-room');
    expect(button).toHaveTextContent('New room');
    expect(screen.queryByTestId('room-play-again')).toBeNull();
    act(() => button.click());
    await waitFor(() => expect(window.location.pathname).toBe('/rooms/create'));
    expect(window.location.search).toBe('?topicId=t1&count=2');
    expect(clients.every((c) => c.published.length === 0)).toBe(true);
  });

  it('a Play again refused as late turns into New room', async () => {
    await open(0, rated(11));
    await screen.findByTestId('room-play-again');
    act(() => void screen.getByTestId('room-play-again').click());
    await act(flush);
    const socket = clients[clients.length - 1]!;
    socket.open();
    await act(flush);
    act(() => socket.deliver({ type: 'ERROR', serverTime: SERVER_TIME, payload: { code: 'ROOM_NOT_FOUND' } }));
    expect(await screen.findByTestId('room-new-room')).toBeInTheDocument();
    expect(screen.queryByTestId('room-play-again')).toBeNull();
  });

  /** The host taps Play again and the server answers with `code`; the socket is returned. */
  async function playAgainRefusedWith(code: string) {
    await open(0, rated(11));
    await screen.findByTestId('room-play-again');
    act(() => void screen.getByTestId('room-play-again').click());
    await act(flush);
    const socket = clients[clients.length - 1]!;
    socket.open();
    await act(flush);
    act(() => socket.deliver({ type: 'ERROR', serverTime: SERVER_TIME, payload: { code } }));
    return socket;
  }

  it('a Play again refused as busy shows the message in the action bar and keeps Play again', async () => {
    await playAgainRefusedWith('ALREADY_IN_MATCH');
    const bar = screen.getByTestId('results-actions');
    expect(await within(bar).findByText(/already in a match or a room/)).toBeInTheDocument();
    expect(within(bar).getByTestId('room-play-again')).not.toHaveAttribute('aria-busy');
    expect(screen.queryByTestId('room-new-room')).toBeNull();
    expect(window.location.pathname).toBe('/results');
  });

  it('a Play again whose successor already closed (ROOM_EXPIRED) turns into New room', async () => {
    await playAgainRefusedWith('ROOM_EXPIRED');
    expect(await screen.findByTestId('room-new-room')).toBeInTheDocument();
    expect(screen.queryByTestId('room-play-again')).toBeNull();
  });

  it('a player gets "Join <host>\'s new room" beside Home when ROOM_SUCCEEDED arrives, announced once, and one tap joins', async () => {
    await open(2, rated(-6));
    await screen.findByTestId('results-actions');
    expect(screen.queryByTestId('room-join-new')).toBeNull();
    act(() => liveGameStore.setState({ succeeded: { matchId: MATCH_ID, payload: SUCCEEDED } }));
    const join = await screen.findByTestId('room-join-new');
    expect(join).toHaveTextContent("Join Fathima S's new room");
    expect(within(screen.getByTestId('results-actions')).getAllByRole('button')).toHaveLength(3);
    // The topic's copy of the same message changes nothing.
    act(() => liveGameStore.setState({ succeeded: { matchId: MATCH_ID, payload: { ...SUCCEEDED } } }));
    act(() => join.click());
    await act(flush);
    const socket = clients[clients.length - 1]!;
    socket.open();
    await act(flush);
    expect(socket.bodiesTo('/app/room/join')).toEqual([{ code: 'K7M2QX' }]);
    act(() => socket.deliver(joinedMessage('MEMBER')));
    await waitFor(() => expect(window.location.pathname).toBe('/r/K7M-2QX'));
  });

  it('a full successor shows the Story 5.3 message in the action bar and keeps the button', async () => {
    await open(2, rated(-6));
    await screen.findByTestId('results-actions');
    act(() => liveGameStore.setState({ succeeded: { matchId: MATCH_ID, payload: SUCCEEDED } }));
    act(() => screen.getByTestId('room-join-new').click());
    await act(flush);
    const socket = clients[clients.length - 1]!;
    socket.open();
    await act(flush);
    act(() => socket.deliver({ type: 'ERROR', serverTime: SERVER_TIME, payload: { code: 'ROOM_FULL' } }));
    const bar = screen.getByTestId('results-actions');
    expect(await within(bar).findByText(/Room is full/)).toBeInTheDocument();
    expect(within(bar).getByTestId('room-join-new')).toBeInTheDocument();
  });

  it('a reload within the window restores the Join button from the stored message; after the window it is gone', async () => {
    stubCore(rated(-6));
    storeRoom(2);
    lastResult.saveSucceeded(MATCH_ID, SUCCEEDED);
    session.start();
    await session.ready();
    renderApp('/results');
    expect(await screen.findByTestId('room-join-new')).toHaveTextContent("Join Fathima S's new room");
  });

  it('after the window the stored successor is dropped and a player has Home alone', async () => {
    stubCore(rated(-6));
    storeRoom(2);
    lastResult.saveSucceeded(MATCH_ID, SUCCEEDED);
    ageStored(61_000);
    session.start();
    await session.ready();
    renderApp('/results');
    const bar = await screen.findByTestId('results-actions');
    expect(within(bar).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByTestId('room-join-new')).toBeNull();
  });

  describe('on a custom topic (Story 6.5b)', () => {
    it('labels the result "Own · unrated" and never asks for a rating change or shows one', async () => {
      const fetchMatch = vi.fn(() => rated(11)());
      await open(2, fetchMatch, { source: 'CUSTOM' });
      await screen.findByTestId('breakdown');
      expect(screen.getAllByText(/Renaissance · Own · unrated/).length).toBeGreaterThan(0);
      expect(fetchMatch).not.toHaveBeenCalled();
      expect(screen.queryByTestId('rating-delta')).toBeNull();
      expect(screen.queryByText(/updating/i)).toBeNull();
    });

    it('a breakdown row shows the explanation with no source line, report link or Practise link', async () => {
      await open(2, rated(11), { source: 'CUSTOM' });
      const rows = await screen.findAllByTestId('breakdown-row');
      act(() => within(rows[0]!).getAllByRole('button')[0]!.click());
      // The correct row opens on tap and the wrong one is open already: both show the explanation.
      await waitFor(() => expect(screen.getAllByTestId('reveal-details').length).toBe(2));
      expect(screen.queryByTestId('attribution')).toBeNull();
      expect(screen.queryByTestId('report-link')).toBeNull();
      expect(screen.queryByText(/Practise this topic/i)).toBeNull();
    });

    it('after the window the host sees New room, which opens a blank Create (the payload names no topic id)', async () => {
      stubCore(rated(11));
      storeRoom(0, { source: 'CUSTOM' });
      ageStored(61_000);
      session.start();
      await session.ready();
      renderApp('/results');
      const button = await screen.findByTestId('room-new-room');
      act(() => button.click());
      await waitFor(() => expect(window.location.pathname).toBe('/rooms/create'));
      expect(window.location.search).toBe('?count=2');
    });
  });
});
