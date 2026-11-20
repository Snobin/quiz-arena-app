import { useEffect, useId, useRef } from 'react';
import { adminT, type AdminKey } from './adminI18n.ts';

const ROWS: { key: string; label: AdminKey }[] = [
  { key: 'P', label: 'shortcuts.publish' },
  { key: 'D', label: 'shortcuts.discard' },
  { key: 'E', label: 'shortcuts.edit' },
  { key: 'J', label: 'shortcuts.next' },
  { key: 'K', label: 'shortcuts.previous' },
  { key: '?', label: 'shortcuts.help' },
];

/** The keyboard shortcuts list. Esc or Close closes it; focus returns to the control that opened it. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="fixed inset-[0] z-20 flex items-center justify-center bg-ink/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-[28rem] flex-col gap-4 rounded-lg border border-hairline bg-card p-4"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <h2 id={titleId} className="text-body font-bold text-ink">
          {adminT('shortcuts.title')}
        </h2>
        <p className="text-caption text-muted">{adminT('shortcuts.note')}</p>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
          {ROWS.map((row) => (
            <div key={row.key} className="contents">
              <dt>
                <kbd className="rounded-sm border border-hairline px-2 text-body font-bold">{row.key}</kbd>
              </dt>
              <dd>{adminT(row.label)}</dd>
            </div>
          ))}
        </dl>
        <div>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            className="hit-target inline-flex min-h-target-min items-center rounded-md border-[1.5px] border-ink bg-card px-4 py-2 text-body text-ink"
          >
            {adminT('shortcuts.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
