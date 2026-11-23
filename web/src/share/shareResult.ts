import i18n from 'i18next';
import { copyText } from '../screens/rooms/share.ts';
import type { MatchEndedPayload } from '../realtime/protocol.ts';
import { buildCardText, type CardText } from './cardText.ts';
import { renderCard } from './drawCard.ts';
import { CARD_FONT_FAMILY } from './drawCard.ts';

/**
 * How a share ended. `shared`: the OS sheet took the image, line and link. `cancelled`: she closed the sheet (nothing is
 * shown). `saved`: the image was downloaded and the text plus link copied. `savedLink`: downloaded, but the clipboard refused,
 * so the caller shows the link as selectable text. `failed`: no image could be made.
 */
export type ShareResult = { outcome: 'shared' | 'cancelled' | 'saved' | 'failed' } | { outcome: 'savedLink'; url: string };

export const FILE_NAME = 'minnal-result.png';
const FONT_WAIT_MS = 3000;

/** Waits for the Malayalam face for this card's text, or 3 s, whichever comes first (UX-DR73). */
export async function fontReady(card: CardText, fonts: Pick<FontFaceSet, 'load'> | undefined = typeof document === 'undefined' ? undefined : document.fonts): Promise<void> {
  if (!fonts) return;
  const text = `${card.resultLine} ${card.modeLine} ${card.cta}`;
  const load = Promise.all([fonts.load(`700 56px ${CARD_FONT_FAMILY}`, text), fonts.load(`400 56px ${CARD_FONT_FAMILY}`, text)]).then(() => undefined, () => undefined);
  await Promise.race([load, new Promise<void>((resolve) => setTimeout(resolve, FONT_WAIT_MS))]);
}

type Env = {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  download: (blob: Blob, name: string) => void;
  copy: (text: string) => Promise<boolean>;
  render: (card: CardText, wordmark: string) => Promise<Blob | null>;
  ready: (card: CardText) => Promise<void>;
};

function browserEnv(): Env {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    canShare: typeof nav?.canShare === 'function' ? (data) => nav.canShare(data) : undefined,
    share: typeof nav?.share === 'function' ? (data) => nav.share(data) : undefined,
    download(blob, name) {
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    },
    copy: (text) => copyText(text),
    render: (card, wordmark) => renderCard(card, wordmark),
    ready: (card) => fontReady(card),
  };
}

/**
 * Draws the result card in the browser and shares it (Story 7.1): the file through the OS sheet where that is supported,
 * otherwise a download plus the text and link on the clipboard. No server is involved.
 */
export async function shareResult(payload: MatchEndedPayload, selfId: string, env: Env = browserEnv()): Promise<ShareResult> {
  const card = buildCardText(payload, selfId);
  if (!card) return { outcome: 'failed' };
  await env.ready(card);
  let blob: Blob | null;
  try {
    blob = await env.render(card, i18n.getFixedT(card.language)('brand.name'));
  } catch {
    blob = null;
  }
  if (!blob) return { outcome: 'failed' };

  const file = new File([blob], FILE_NAME, { type: 'image/png' });
  const data: ShareData = { files: [file], text: card.shareText, url: card.url };
  if (env.share && env.canShare?.({ files: [file] })) {
    try {
      await env.share(data);
      return { outcome: 'shared' };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { outcome: 'cancelled' };
      // Any other refusal: fall back to the download, so she is never left with nothing.
    }
  }
  env.download(blob, FILE_NAME);
  return (await env.copy(`${card.shareText} ${card.url}`)) ? { outcome: 'saved' } : { outcome: 'savedLink', url: card.url };
}
