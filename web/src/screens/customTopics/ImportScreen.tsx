import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { announce } from '../../shell/announce.ts';
import { useOnline } from '../../shell/online.ts';
import { useLeaveGuard } from '../../shell/useLeaveGuard.ts';
import { Disclosures } from './Disclosures.tsx';
import { ImportErrorList } from './ImportErrorList.tsx';
import { fetchUsage, importTopic, type Imported, type Usage } from './importApi.ts';
import './importCatalogue.ts';
import { clearDraft, readDraft, writeDraft } from './importDraft.ts';
import { checkImport, MAX_NAME, offsetOf, type ImportCheck, type Problem } from './importParse.ts';
import { LeaveDialog } from './LeaveDialog.tsx';
import { PasteArea } from './PasteArea.tsx';
import { SuccessCard } from './SuccessCard.tsx';

const DEBOUNCE_MS = 300;
const LIST_ID = 'importErrors';

/** Publishes the bottom bar's height as `--fixed-bar-height`, so the page pads past it. */
function useFixedBarHeight(ref: React.RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--fixed-bar-height', `${bar.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--fixed-bar-height');
    };
  }, [ref]);
}

/** Splits "15 found · {{used}} / {{cap}}" so the counts can be bold ink with tabular digits. */
function boldCounts(text: string, counts: Record<string, string>): ReactNode {
  return text.split(/(⟦\w+⟧)/).map((part, i) => {
    const key = /^⟦(\w+)⟧$/.exec(part)?.[1];
    return key && key in counts ? (
      <b key={i} className="font-bold tabular-nums text-ink">
        {counts[key]}
      </b>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    );
  });
}

type Server = { problems: Problem[] } | { note: string } | null;

/**
 * `/me/custom-topics/import` (Story 6.2): paste LLM-written JSON, see everything wrong with it (with line numbers) before
 * anything is sent, and save it as a private topic. The browser checks what the server checks; the server decides.
 */
export default function ImportScreen() {
  const { t } = useTranslation();
  useDocumentTitle(t('import.title'));
  const online = useOnline();
  const initial = useRef(readDraft()).current;

  const [name, setName] = useState(initial.name);
  const [nameEdited, setNameEdited] = useState(initial.nameEdited);
  const [text, setText] = useState(initial.text);
  const [check, setCheck] = useState<ImportCheck | null>(() => (initial.text.trim() ? checkImport(initial.text) : null));
  const [usage, setUsage] = useState<Usage | null>(null);
  const [server, setServer] = useState<Server>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Imported | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [marked, setMarked] = useState<number | null>(null);
  const [open, setOpen] = useState<{ schema?: boolean; prompt?: boolean }>({});
  const [fresh, setFresh] = useState(0);

  const area = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const announced = useRef('');
  useFixedBarHeight(bar);

  const dirty = text.trim() !== '' && !done;
  const guard = useLeaveGuard(dirty);

  useEffect(() => {
    let live = true;
    void fetchUsage().then((u) => live && setUsage(u));
    return () => {
      live = false;
    };
  }, [fresh]);

  // The check runs 300 ms after typing stops; the name follows "topic" only while it is unedited.
  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => {
      const next = text.trim() ? checkImport(text) : null;
      setCheck(next);
      if (next?.topic && !nameEdited) setName(next.topic.slice(0, MAX_NAME));
      if (next) {
        const message = next.problems.length > 0 ? t('import.announce.problems', { count: next.problems.length }) : t('import.announce.found', { count: next.found });
        if (message !== announced.current) {
          announced.current = message;
          announce(message);
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, nameEdited, done, t]);

  useEffect(() => {
    if (!done) writeDraft({ name, text, nameEdited });
  }, [name, text, nameEdited, done]);

  useEffect(() => {
    if (focusTick > 0) list.current?.focus();
  }, [focusTick]);

  const problems = server && 'problems' in server ? server.problems : (check?.problems ?? []);
  const found = check?.found ?? 0;
  const trimmedName = name.trim();
  const usedAfter = usage ? usage.questions + found : null;
  const overQuestions = usage !== null && usedAfter !== null && usedAfter > usage.questionCap;
  const overTopics = usage !== null && usage.topics >= usage.topicCap;

  let reason: string | null = null;
  if (!online) reason = t('import.reason.offline');
  else if (problems.length > 0) reason = t('import.reason.fix', { count: problems.length });
  else if (found === 0) reason = t('import.reason.paste');
  else if (!trimmedName) reason = t('import.reason.name');
  else if (overQuestions) reason = t('import.reason.over.questions', { cap: usage!.questionCap });
  else if (overTopics) reason = t('import.reason.over.topics');

  const hasErrors = problems.length > 0;
  const schemaOpen = open.schema ?? !hasErrors;
  const promptOpen = open.prompt ?? false;

  const badLines = useMemo(() => new Set(problems.map((p) => p.line).filter((n): n is number => n !== undefined)), [problems]);

  const onText = (value: string) => {
    setText(value);
    setServer(null);
    setMarked(null);
    setOpen({});
  };

  const jump = (problem: Problem) => {
    const el = area.current;
    if (!el || problem.line === undefined) return;
    const offset = offsetOf(text, problem.line, problem.column ?? 1);
    el.focus();
    el.setSelectionRange(offset, offset);
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 19;
    el.scrollTop = Math.max(0, (problem.line - 3) * lineHeight);
    setMarked(problem.line);
  };

  const submit = async () => {
    if (sending || reason) return;
    setSending(true);
    setServer(null);
    const outcome = await importTopic(trimmedName, text);
    setSending(false);
    if (outcome.ok) {
      clearDraft();
      guard.release();
      setDone(outcome.data);
      return;
    }
    if (outcome.kind === 'invalid') {
      setServer({ problems: outcome.problems });
      setFocusTick((n) => n + 1);
    } else if (outcome.kind === 'cap' || outcome.kind === 'tooLarge') {
      const detail = outcome.kind === 'tooLarge' ? t('import.note.tooLarge') : (outcome.detail ?? t('import.note.server'));
      setServer({ problems: [{ field: 'import', problem: detail }] });
      setFocusTick((n) => n + 1);
    } else if (outcome.kind === 'rateLimited') {
      setServer({ note: t('import.note.rateLimited', { seconds: outcome.retryAfter ?? 60 }) });
    } else if (outcome.kind === 'unavailable') {
      setServer({ note: t('import.note.unavailable') });
    } else if (outcome.kind === 'network') {
      setServer({ note: t('import.note.network') });
    } else {
      setServer({ note: t('import.note.server') });
    }
  };

  const another = () => {
    clearDraft();
    setDone(null);
    setName('');
    setNameEdited(false);
    setText('');
    setCheck(null);
    setServer(null);
    setFresh((n) => n + 1);
  };

  if (done) {
    return (
      <PageColumn className="py-4">
        <main className="flex flex-col gap-3">
          <SuccessCard name={done.name} count={done.questionCount} onAnother={another} />
        </main>
      </PageColumn>
    );
  }

  const tally =
    found > 0 && usage
      ? boldCounts(t('import.tally', { found: '⟦found⟧', used: '⟦used⟧', cap: '⟦cap⟧' }), { found: String(found), used: String(usedAfter), cap: String(usage.questionCap) })
      : found > 0
        ? boldCounts(t('import.tally.found', { found: '⟦found⟧' }), { found: String(found) })
        : t('import.tally.empty');
  const warnQuestions = usage && !overQuestions && found > 0 && usedAfter! * 5 >= usage.questionCap * 4 ? usage.questionCap - usedAfter! : null;
  const topicsAfter = usage ? usage.topics + 1 : null;
  const warnTopics = usage && !overTopics && found > 0 && topicsAfter! * 5 >= usage.topicCap * 4 ? usage.topicCap - topicsAfter! : null;

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('import.title')}
        </h1>

        {server && 'note' in server ? (
          <p role="alert" className="rounded-lg border border-brick bg-card p-4 text-body text-brick">
            {server.note}
          </p>
        ) : null}
        {hasErrors ? <ImportErrorList ref={list} id={LIST_ID} problems={problems} onJump={jump} /> : null}

        <label className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-muted">{t('import.name.label')}</span>
          <input
            type="text"
            value={name}
            maxLength={MAX_NAME}
            onChange={(event) => {
              setName(event.target.value);
              setNameEdited(true);
              setServer(null);
            }}
            className="min-h-target-min w-full min-w-[0] rounded-md border border-control-edge bg-card px-3 text-body text-ink"
          />
        </label>

        <PasteArea ref={area} value={text} onChange={onText} badLines={badLines} markedLine={marked} invalid={hasErrors} describedBy={hasErrors ? LIST_ID : undefined} />

        <p data-testid="import-tally" className="text-caption text-muted">
          {tally}
        </p>
        {overQuestions ? (
          <p className="text-caption text-brick">{t('import.over.questions', { cap: usage!.questionCap, over: usedAfter! - usage!.questionCap })}</p>
        ) : null}
        {overTopics && found > 0 ? <p className="text-caption text-brick">{t('import.over.topics', { topics: usage!.topics, cap: usage!.topicCap })}</p> : null}
        {warnQuestions !== null ? (
          <p className="flex items-start gap-2 text-caption text-ink">
            <span aria-hidden="true" className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-band text-on-band">
              !
            </span>
            {t('import.headroom.questions', { left: warnQuestions })}
          </p>
        ) : null}
        {warnTopics !== null ? (
          <p className="flex items-start gap-2 text-caption text-ink">
            <span aria-hidden="true" className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-band text-on-band">
              !
            </span>
            {t('import.headroom.topics', { left: warnTopics })}
          </p>
        ) : null}

        <Disclosures
          schemaOpen={schemaOpen}
          promptOpen={promptOpen}
          topicName={name}
          onToggle={(which) => setOpen((o) => (which === 'schema' ? { ...o, schema: !schemaOpen } : { ...o, prompt: !promptOpen }))}
        />
      </main>

      <div ref={bar} className="fixed inset-x-[0] bottom-[0] z-10 border-t border-hairline bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-1 px-gutter-card py-2">
          {sending || reason ? (
            <Button
              variant="primary"
              disabled
              disabledReason={sending ? '' : reason!}
              // A tap on a blocked Import with problems on screen brings the error list into view and focus.
              onClickCapture={() => {
                if (!sending && hasErrors && online) setFocusTick((n) => n + 1);
              }}
            >
              {sending ? t('import.button.sending') : t('import.button', { count: found })}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void submit()}>
              {t('import.button', { count: found })}
            </Button>
          )}
        </div>
      </div>
      {guard.asking ? <LeaveDialog onStay={guard.stay} onLeave={guard.leave} /> : null}
    </PageColumn>
  );
}
