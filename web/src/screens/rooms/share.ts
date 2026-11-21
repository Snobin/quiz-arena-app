/** Sharing a room: the OS share sheet where there is one, else the clipboard; and copying the bare code. */

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export type ShareContent = { title: string; text: string; url: string };

type ShareEnv = {
  share?: (data: ShareContent) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
};

function browserEnv(): ShareEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    share: typeof nav?.share === 'function' ? (data) => nav.share(data) : undefined,
    writeText: typeof nav?.clipboard?.writeText === 'function' ? (text) => nav.clipboard.writeText(text) : undefined,
  };
}

/** Writes `text` to the clipboard; false when the clipboard is missing or refuses. */
export async function copyText(text: string, env: ShareEnv = browserEnv()): Promise<boolean> {
  if (!env.writeText) return false;
  try {
    await env.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the share sheet with `content`. Where `navigator.share` is missing the text and link are copied together
 * (`copied`); a share sheet the player dismissed (`AbortError`) does nothing (`cancelled`).
 */
export async function shareRoom(content: ShareContent, env: ShareEnv = browserEnv()): Promise<ShareOutcome> {
  if (env.share) {
    try {
      await env.share(content);
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Any other refusal: fall back to copying, so the host is never left with nothing.
    }
  }
  return (await copyText(`${content.text}\n${content.url}`, env)) ? 'copied' : 'failed';
}

/** Selects the contents of `element`, so a refused clipboard still leaves the text ready to copy by hand. */
export function selectContents(element: HTMLElement | null): void {
  if (!element || typeof window === 'undefined') return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}
