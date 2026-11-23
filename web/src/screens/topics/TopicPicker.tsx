import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { detectLanguage } from '../../i18n/Lang.tsx';
import type { MessageKey } from '../../i18n/index.ts';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import '../practice/practiceCatalogue.ts';
import '../rooms/roomCatalogue.ts';
import { fetchTopicList, TOPIC_LIST_KEY, type TopicSummary } from '../customTopics/manageApi.ts';
import { MIN_QUESTIONS } from '../rooms/roomConfig.ts';
import { useReducedEffects } from '../../motion/reduceEffects.ts';
import { announce } from '../../shell/announce.ts';
import { Link } from '../../shell/Link.tsx';
import { useOnline } from '../../shell/online.ts';
import {
  fetchRecentTopics,
  fetchTopics,
  markTopicUsed,
  TopicsError,
  type Catalogue,
  type PickedTopic,
  type SubjectItem,
} from './topicsApi.ts';

export type TopicPurpose = 'TOPIC_DUEL' | 'SOLO_PRACTICE' | 'BATTLE_ROOM';
/** The question bank, and (Solo Practice only, Story 6.4) the player's own custom topics. */
export type TopicSource = 'BANK' | 'CUSTOM';

export type TopicPickerProps = {
  purpose: TopicPurpose;
  /** One ink line above the search field, announced politely once (a requested topic is not available). */
  notice?: string;
  onSelect: (topic: PickedTopic) => void;
  /** Called for a row of My topics; without `'CUSTOM'` in `sources` that section never loads or shows. */
  onSelectCustom?: (topic: TopicSummary) => void;
  sources?: readonly TopicSource[];
};

export const TOPICS_QUERY_KEY = ['topics'] as const;
export const RECENT_TOPICS_QUERY_KEY = ['recentTopics'] as const;
const STALE_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 200;

const HEADING: Record<TopicPurpose, MessageKey> = {
  TOPIC_DUEL: 'topics.heading.duel',
  SOLO_PRACTICE: 'topics.heading.solo',
  BATTLE_ROOM: 'topics.heading.room',
};

/** NFC and case-insensitive, so Malayalam and Latin text match as typed. */
function fold(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase();
}

/** Subjects and topics matching `query`: a subject that matches shows all its topics. */
export function filterCatalogue(subjects: readonly SubjectItem[], query: string): SubjectItem[] {
  const needle = fold(query.trim());
  if (!needle) return [...subjects];
  const result: SubjectItem[] = [];
  for (const subject of subjects) {
    if (fold(subject.name).includes(needle)) result.push(subject);
    else {
      const topics = subject.topics.filter((topic) => fold(topic.name).includes(needle));
      if (topics.length > 0) result.push({ ...subject, topics });
    }
  }
  return result;
}

function Chevron() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-none">
      <path d="M6 3l5 5-5 5" stroke="var(--color-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkeletonRows() {
  const reduced = useReducedEffects();
  return (
    <ul aria-hidden="true" data-testid="topic-skeleton" className="rounded-lg border border-hairline bg-card">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="flex min-h-[56px] items-center gap-3 border-b border-hairline px-4 py-2 last:border-b-0">
          <span className="flex flex-1 flex-col gap-2">
            <span className={['h-4 w-2/3 rounded-md bg-tile', reduced ? '' : 'animate-pulse'].join(' ')} />
            <span className={['h-3 w-1/3 rounded-md bg-tile', reduced ? '' : 'animate-pulse'].join(' ')} />
          </span>
        </li>
      ))}
    </ul>
  );
}

type RowProps = {
  topic: { topicId: string; name: string; publishedCount: number };
  subjectName: string;
  disabled: boolean;
  onPick: () => void;
};

function TopicRow({ topic, subjectName, disabled, onPick }: RowProps) {
  const { t } = useTranslation();
  const questions = t('topics.questions', { count: topic.publishedCount });
  return (
    <li className="border-b border-hairline last:border-b-0">
      <button
        type="button"
        aria-disabled={disabled ? 'true' : undefined}
        aria-label={t('topics.row.a11y', { topic: topic.name, subject: subjectName, questions })}
        onClick={() => {
          if (!disabled) onPick();
        }}
        className={[
          'hit-target flex min-h-[56px] w-full min-w-[0] items-center gap-3 rounded-lg px-4 py-2 text-left',
          disabled ? 'cursor-not-allowed' : '',
        ].join(' ')}
      >
        <span className="flex min-w-[0] flex-1 flex-col">
          <span lang={detectLanguage(topic.name)} className={['text-body font-semibold break-words', disabled ? 'text-muted' : 'text-ink'].join(' ')}>
            {topic.name}
          </span>
          <span lang={detectLanguage(questions)} className="text-caption text-muted">
            {questions}
          </span>
          {disabled ? <span className="text-caption text-muted">{t('offline.playCaption')}</span> : null}
        </span>
        <Chevron />
      </button>
    </li>
  );
}

function MineRow({ topic, unrated, disabled, onPick }: { topic: TopicSummary; unrated: boolean; disabled: boolean; onPick: () => void }) {
  const { t } = useTranslation();
  const questions = t(unrated ? 'rooms.mine.row' : 'topics.mine.row', { count: topic.questionCount });
  return (
    <li className="border-b border-hairline last:border-b-0">
      <button
        type="button"
        aria-disabled={disabled ? 'true' : undefined}
        aria-label={`${topic.name}, ${questions}`}
        onClick={() => {
          if (!disabled) onPick();
        }}
        className={['hit-target flex min-h-[56px] w-full min-w-[0] items-center gap-3 rounded-lg px-4 py-2 text-left', disabled ? 'cursor-not-allowed' : ''].join(' ')}
      >
        <span className="flex min-w-[0] flex-1 flex-col">
          <span lang={detectLanguage(topic.name)} className={['text-body font-semibold break-words', disabled ? 'text-muted' : 'text-ink'].join(' ')}>
            {topic.name}
          </span>
          <span className="text-caption text-muted">{questions}</span>
          {disabled ? <span className="text-caption text-muted">{t('offline.playCaption')}</span> : null}
        </span>
        <Chevron />
      </button>
    </li>
  );
}

/**
 * The shared topic chooser (Story 4.1): search, a Recent section and one section per subject, from the
 * question bank. Selecting a topic records it as recent (fire and forget) and calls `onSelect`.
 */
export function TopicPicker({ purpose, notice, onSelect, onSelectCustom, sources = ['BANK'] }: TopicPickerProps) {
  const { t } = useTranslation();
  useDocumentTitle(t('title.topics'));
  const online = useOnline();
  const queryClient = useQueryClient();
  const catalogue = useQuery({ queryKey: TOPICS_QUERY_KEY, queryFn: fetchTopics, staleTime: STALE_MS, retry: false });
  const recent = useQuery({ queryKey: RECENT_TOPICS_QUERY_KEY, queryFn: fetchRecentTopics, staleTime: STALE_MS, retry: false });
  const withCustom = sources.includes('CUSTOM') && onSelectCustom !== undefined;
  // A failure here only hides the section: the bank stays usable.
  const mine = useQuery({ queryKey: TOPIC_LIST_KEY, queryFn: fetchTopicList, staleTime: STALE_MS, retry: false, enabled: withCustom });
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (notice) announce(notice);
  }, [notice]);

  const data: Catalogue | undefined = catalogue.data;
  const searching = query.trim() !== '';
  const filtered = useMemo(() => (data ? filterCatalogue(data.subjects, query) : []), [data, query]);
  // A room needs 5 questions or more (Story 6.5b): smaller topics are left out, and one muted line says so.
  const room = purpose === 'BATTLE_ROOM';
  const allMine = withCustom ? (mine.data?.topics ?? []) : [];
  const usableMine = room ? allMine.filter((topic) => topic.questionCount >= MIN_QUESTIONS) : allMine;
  const hiddenMine = allMine.length - usableMine.length;
  const mineRows = useMemo(() => {
    const needle = fold(query.trim());
    return needle ? usableMine.filter((topic) => fold(topic.name).includes(needle)) : usableMine;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.data, query, withCustom, room]);
  const matchCount = filtered.reduce((sum, subject) => sum + subject.topics.length, 0) + mineRows.length;

  // The count is announced once per settled query, not on every keystroke.
  useEffect(() => {
    if (searching && data) announce(t('topics.count', { count: matchCount }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const subjectName = useMemo(() => {
    const map = new Map<string, string>();
    for (const subject of data?.subjects ?? []) map.set(subject.subjectId, subject.name);
    return map;
  }, [data]);

  const pick = (topic: { topicId: string; name: string; publishedCount: number }, subjectId: string) => {
    void markTopicUsed(topic.topicId).then(() => queryClient.invalidateQueries({ queryKey: RECENT_TOPICS_QUERY_KEY }));
    onSelect({ ...topic, subjectId, subjectName: subjectName.get(subjectId) ?? '' });
  };

  const clear = () => {
    setInput('');
    setQuery('');
    searchRef.current?.focus();
  };

  const recentRows = (recent.data ?? []).filter((r) => subjectName.has(r.subjectId));
  const offlineDisabled = !online;
  const error = catalogue.error;
  // Offline with nothing cached: the query is paused, not failed, so say so here.
  const failed = !data && (catalogue.isError || (!online && catalogue.fetchStatus === 'paused'));

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {t(HEADING[purpose])}
        </h1>
        {notice ? <p className="text-body text-ink">{notice}</p> : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="topicSearch" className="text-caption text-muted">
            {t('topics.search.label')}
          </label>
          <input
            id="topicSearch"
            ref={searchRef}
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            autoComplete="off"
            className="min-h-target-min w-full min-w-[0] rounded-md border-[1.5px] border-ink bg-card px-3 py-2 text-body text-ink"
          />
        </div>

        {failed ? (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-brick bg-card p-4">
            <p className="text-body">
              {!online ? t('topics.error.offline') : error instanceof TopicsError && error.detail ? error.detail : t('topics.error.generic')}
            </p>
            <Button variant="secondary" onClick={() => void catalogue.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : !data ? (
          <>
            <p className="sr-only">{t('common.loading')}</p>
            <SkeletonRows />
          </>
        ) : data.subjects.length === 0 && mineRows.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body">{t('topics.empty')}</p>
            <Link to="/matchmaking" className="hit-target inline-flex min-h-target-min items-center justify-center rounded-md bg-band px-4 py-2 text-body text-on-band">
              {t('play.quickMatch')}
            </Link>
          </div>
        ) : searching && filtered.length === 0 && mineRows.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body">{t('topics.noMatch', { query: query.trim() })}</p>
            <Button variant="secondary" onClick={clear}>
              {t('topics.clear')}
            </Button>
          </div>
        ) : (
          <>
            {mineRows.length > 0 ? (
              <section aria-labelledby="topicsMine" className="flex flex-col gap-2">
                <h2 id="topicsMine" className="text-body font-semibold text-muted">
                  {t('topics.mine')}
                </h2>
                <ul data-testid="my-topics" className="rounded-lg border border-hairline bg-card">
                  {mineRows.map((topic) => (
                    <MineRow key={topic.customTopicId} topic={topic} unrated={room} disabled={offlineDisabled} onPick={() => onSelectCustom?.(topic)} />
                  ))}
                </ul>
              </section>
            ) : null}
            {room && hiddenMine > 0 ? (
              <p data-testid="my-topics-hidden" className="text-caption text-muted">
                {t('rooms.mine.hidden')}
              </p>
            ) : null}
            {!searching && recentRows.length > 0 ? (
              <section aria-labelledby="topicsRecent" className="flex flex-col gap-2">
                <h2 id="topicsRecent" className="text-body font-semibold text-muted">
                  {t('topics.recent')}
                </h2>
                <ul className="rounded-lg border border-hairline bg-card">
                  {recentRows.map((r) => (
                    <TopicRow key={r.topicId} topic={r} subjectName={subjectName.get(r.subjectId) ?? ''} disabled={offlineDisabled} onPick={() => pick(r, r.subjectId)} />
                  ))}
                </ul>
              </section>
            ) : null}
            {filtered.map((subject) => (
              <section key={subject.subjectId} aria-labelledby={`subject-${subject.subjectId}`} className="flex flex-col gap-2">
                <h2 id={`subject-${subject.subjectId}`} lang={detectLanguage(subject.name)} className="text-body font-semibold break-words text-muted">
                  {subject.name}
                </h2>
                <ul className="rounded-lg border border-hairline bg-card">
                  {subject.topics.map((topic) => (
                    <TopicRow key={topic.topicId} topic={topic} subjectName={subject.name} disabled={offlineDisabled} onPick={() => pick(topic, subject.subjectId)} />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </main>
    </PageColumn>
  );
}
