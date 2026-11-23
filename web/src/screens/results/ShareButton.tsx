import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import type { MatchEndedPayload } from '../../realtime/protocol.ts';
import { selectContents } from '../rooms/share.ts';
import { announce } from '../../shell/announce.ts';
import { useOnline } from '../../shell/online.ts';
import '../../share/shareCatalogue.ts';

type Note = { kind: 'saved' } | { kind: 'savedLink'; url: string } | { kind: 'failed' };

/**
 * The Share action of a results bar (Story 7.1) and its inline note. The renderer is a lazy chunk, loaded on the first tap;
 * while the card draws the button reads "…" and ignores taps; offline it is aria-disabled with the offline caption.
 * `button` goes in the bar, `note` above it.
 */
export type ShareSlot = { button: ReactNode; note: ReactNode };

export function useShareCard(payload: MatchEndedPayload, selfId: string): ShareSlot {
  const { t } = useTranslation();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const mounted = useRef(true);
  const linkRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    let next: Note | null = null;
    try {
      const { shareResult } = await import('../../share/shareResult.ts');
      const result = await shareResult(payload, selfId);
      if (result.outcome === 'saved') next = { kind: 'saved' };
      else if (result.outcome === 'savedLink') next = { kind: 'savedLink', url: result.url };
      else if (result.outcome === 'failed') next = { kind: 'failed' };
    } catch {
      next = { kind: 'failed' };
    }
    if (!mounted.current) return;
    setBusy(false);
    setNote(next);
    if (next) announce(next.kind === 'saved' ? t('share.saved') : next.kind === 'savedLink' ? `${t('share.savedLink')} ${next.url}` : t('share.failed'));
  }, [busy, payload, selfId, t]);

  // A refused clipboard leaves the link ready to copy by hand.
  useEffect(() => {
    if (note?.kind === 'savedLink') selectContents(linkRef.current);
  }, [note]);

  const button = !online ? (
    <Button variant="secondary" data-testid="share-button" disabled disabledReason={t('share.offline')}>
      {t('share.button')}
    </Button>
  ) : busy ? (
    <Button variant="secondary" data-testid="share-button" aria-busy="true" disabled disabledReason="">
      {t('share.rendering')}
    </Button>
  ) : (
    <Button variant="secondary" data-testid="share-button" onClick={() => void share()}>
      {t('share.button')}
    </Button>
  );

  const noteNode = note ? (
    <p data-testid="share-note" className="text-body text-muted">
      {note.kind === 'saved' ? t('share.saved') : note.kind === 'failed' ? t('share.failed') : t('share.savedLink')}
      {note.kind === 'savedLink' ? (
        <>
          {' '}
          <span ref={linkRef} className="select-all font-semibold text-ink">
            {note.url}
          </span>
        </>
      ) : null}
    </p>
  ) : null;

  return { button, note: noteNode };
}
