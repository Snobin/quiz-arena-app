import { forwardRef, useRef, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** 1-based lines with a problem: a brick rule and a bold brick number in the gutter. */
  badLines: ReadonlySet<number>;
  /** The line the player jumped to from an error row. */
  markedLine: number | null;
  invalid: boolean;
  describedBy?: string;
};

/**
 * The JSON paste area: a no-wrap textarea beside a line-number gutter kept in step with it (vertical scroll copied across).
 * Only the textarea scrolls sideways. `lang` is left unset so Malayalam shapes in the fallback face.
 */
export const PasteArea = forwardRef<HTMLTextAreaElement, Props>(function PasteArea({ value, onChange, badLines, markedLine, invalid, describedBy }, ref) {
  const { t } = useTranslation();
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value.split('\n').length;
  const numbers = Array.from({ length: lines }, (_, i) => i + 1);

  return (
    <div
      className={`flex min-w-[0] overflow-hidden rounded-md bg-card ${invalid ? 'border-[1.5px] border-brick' : 'border border-control-edge'}`}
    >
      <div
        ref={gutter}
        aria-hidden="true"
        data-testid="paste-gutter"
        className="flex-none select-none overflow-hidden bg-tile py-2 pb-6 text-right font-code text-code text-muted"
      >
        {numbers.map((n) => {
          const bad = badLines.has(n);
          return (
            <div
              key={n}
              data-line={n}
              data-bad={bad ? 'true' : undefined}
              data-marked={markedLine === n ? 'true' : undefined}
              className={`border-l-[3px] pl-1 pr-2 ${bad ? 'border-brick font-bold text-brick' : 'border-transparent'} ${markedLine === n ? 'bg-hairline' : ''}`}
            >
              {n}
            </div>
          );
        })}
      </div>
      <textarea
        ref={ref}
        value={value}
        wrap="off"
        rows={12}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={t('import.paste.label')}
        aria-describedby={describedBy}
        aria-invalid={invalid ? 'true' : undefined}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        onScroll={(event) => {
          if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
        }}
        className="min-h-target-min min-w-[0] flex-1 resize-y overflow-auto whitespace-pre bg-card px-2 py-2 pb-6 font-code text-code text-ink"
      />
    </div>
  );
});
