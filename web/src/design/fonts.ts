/** Published path of the self-hosted Malayalam face (see fonts.css and index.html). */
export const MALAYALAM_FONT_URL = '/fonts/noto-sans-malayalam-2.104.woff2';

/** The font shorthand that requests the live-match face (fonts.css). */
const LIVE_FONT_PROBE = '1em "Noto Sans Malayalam Live"';

/** Default cap on waiting for fonts before matchmaking and the 3-2-1 countdown (EXPERIENCE.md). */
export const FONTS_READY_CAP_MS = 3000;

/**
 * Resolves once the Live face has loaded and `document.fonts.ready` has settled, or after `capMs`,
 * whichever comes first. `ready` alone resolves at once when no load is pending (e.g. before any
 * live-match text is laid out), so the optional Live face is requested explicitly here.
 * It never rejects: a font that fails or stalls must never block play, only delay it by the cap.
 */
export function fontsReady(capMs: number = FONTS_READY_CAP_MS): Promise<void> {
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(done, capMs);
    try {
      const fonts = typeof document === 'undefined' ? undefined : document.fonts;
      if (!fonts?.ready) {
        done();
        return;
      }
      const live = typeof fonts.load === 'function' ? fonts.load(LIVE_FONT_PROBE, 'മ') : Promise.resolve();
      void Promise.allSettled([live, fonts.ready]).then(done);
    } catch {
      done();
    }
  });
}
