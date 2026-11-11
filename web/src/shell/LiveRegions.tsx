import { useEffect, useState } from 'react';
import { regionText, useAnnouncements } from './announce.ts';

/**
 * The app's only live regions (EXPERIENCE.md › Focus and announcements): one polite status and
 * one assertive region. Render once, in the shell; speak through `announce()`.
 *
 * Screen readers ignore content that arrives with a just-inserted live region, so the regions
 * mount empty and show text only from the next tick (e.g. the offline notice when the app boots
 * offline lands as a change to an existing region).
 */
export function LiveRegions() {
  const polite = useAnnouncements((s) => s.polite);
  const assertive = useAnnouncements((s) => s.assertive);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-polite">
        {ready && polite.seq > 0 ? regionText(polite) : ''}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only" data-testid="live-assertive">
        {ready && assertive.seq > 0 ? regionText(assertive) : ''}
      </div>
    </>
  );
}
