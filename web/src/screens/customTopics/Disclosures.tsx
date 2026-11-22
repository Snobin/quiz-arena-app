import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { announce } from '../../shell/announce.ts';
import { copyText } from '../rooms/share.ts';

const COPIED_MS = 2000;
const TEXT_LINK = 'hit-target inline-flex min-h-target-min items-center px-4 text-body font-semibold text-ink underline';
const CODE = 'overflow-x-auto whitespace-pre rounded-sm bg-tile p-3 font-code text-code text-ink-soft';

/** The FR46 shape. Not translated: it is the JSON the player writes. */
const SCHEMA = `{
  "topic": "Kerala Renaissance",
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "answer": 0,
      "explanation": "..."
    }
  ]
}`;

const PROMPT = `Write [NUMBER, e.g. 15] multiple-choice questions for Kerala PSC exam practice on the topic "[TOPIC]".
Write every question, option and explanation in [Malayalam / English].

Rules:
- Each question has exactly 4 options, and exactly one of them is correct.
- "answer" is the position of the correct option: 0 = first, 1 = second, 2 = third, 3 = fourth.
- No two options in a question may be the same. Do not use "All of the above" or "None of the above".
- Each question has a short explanation (1-2 sentences) of why the answer is correct.
- Use only facts you are sure of. Keep each question under 1000 characters and each option under 300.

Reply with only the JSON below and nothing else - no notes and no code block:
{"topic": "[TOPIC]", "questions": [{"question": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "..."}]}`;

/** The sample prompt with [TOPIC] replaced by the topic name once it is filled. */
export function promptFor(topicName: string): string {
  const name = topicName.trim();
  return name ? PROMPT.replaceAll('[TOPIC]', name) : PROMPT;
}

type RowProps = { id: string; title: string; open: boolean; onToggle: () => void; copy: string; children: ReactNode };

function Row({ id, title, open, onToggle, copy, children }: RowProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = async () => {
    if (!(await copyText(copy))) return;
    setCopied(true);
    announce(t('import.copied'));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <li className="border-b border-hairline last:border-b-0">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="hit-target flex min-h-target-min min-w-[0] flex-1 items-center gap-2 px-4 py-2 text-left text-body font-semibold text-ink"
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          {title}
        </button>
        <button type="button" onClick={() => void onCopy()} className={TEXT_LINK}>
          {copied ? t('import.copied') : t('import.copy')}
        </button>
      </div>
      {open ? (
        <div id={id} className="flex flex-col gap-2 px-4 pb-4">
          {children}
        </div>
      ) : null}
    </li>
  );
}

type Props = { schemaOpen: boolean; promptOpen: boolean; onToggle: (which: 'schema' | 'prompt') => void; topicName: string };

/** The two disclosure rows under the paste area: the JSON format (open by default) and the sample GPT prompt. */
export function Disclosures({ schemaOpen, promptOpen, onToggle, topicName }: Props) {
  const { t } = useTranslation();
  const prompt = promptFor(topicName);
  return (
    <ul className="rounded-lg border border-hairline bg-card">
      <Row id="import-format" title={t('import.format.title')} open={schemaOpen} onToggle={() => onToggle('schema')} copy={SCHEMA}>
        <pre className={CODE}>{SCHEMA}</pre>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-caption text-muted">
          {(['1', '2', '3', '4', '5', '6'] as const).map((n) => (
            <li key={n}>{t(`import.rule.${n}` as const)}</li>
          ))}
        </ul>
      </Row>
      <Row id="import-prompt" title={t('import.prompt.title')} open={promptOpen} onToggle={() => onToggle('prompt')} copy={prompt}>
        <pre lang="en" className={`${CODE} whitespace-pre-wrap`}>{prompt}</pre>
        <p className="text-caption text-muted">{t('import.prompt.note')}</p>
      </Row>
    </ul>
  );
}
