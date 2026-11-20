import { adminT } from './adminI18n.ts';
import type { Batch } from './draftActions.ts';

const number = (n: number) => n.toLocaleString('en-US');

function batchText(batch: Batch): string {
  if (batch.bulk) return adminT(batch.action === 'publish' ? 'drafts.doneMany.publish' : 'drafts.doneMany.discard', { count: batch.refs.length });
  const ref = batch.refs[0] as Batch['refs'][number];
  return adminT(batch.action === 'publish' ? 'drafts.done.publish' : 'drafts.done.discard', { no: number(ref.displayNo), version: ref.version });
}

/** "Published Q 1234 v3 · Undo": what a row, or a whole batch, collapses to for 5 s. */
export function UndoLine({ batch, onUndo, autoFocus = false }: { batch: Batch; onUndo: () => void; autoFocus?: boolean }) {
  const text = batchText(batch);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{text}</span>
      <span aria-hidden="true">·</span>
      <button type="button" autoFocus={autoFocus} aria-label={adminT('drafts.undoLabel', { text })} onClick={onUndo} className="hit-target inline-flex min-h-target-min items-center font-bold underline">
        {adminT('drafts.undo')}
      </button>
    </span>
  );
}
