import { useEffect, useState, type CSSProperties } from 'react';
import { useDocumentTitle } from '../i18n/useDocumentTitle.ts';
import { PageColumn } from './PageColumn.tsx';

// Dev-only Malayalam shaping QA page at /__shaping (never shipped: App imports it behind
// import.meta.env.DEV). Open it on Chrome Android: every sample must shape with no dotted
// circle (◌). The fallback-only row shows whether local() resolved the system Malayalam face.
// Strings here are developer-facing and not part of the i18n catalogue.
// check-i18n: dev-fixture

const SAMPLES = [
  { label: 'ക്ഷ (k.ssa)', text: 'ക്ഷ പരീക്ഷ ക്ഷേത്രം' },
  { label: 'ന്റ (old-orthography nta)', text: 'ന്റ എന്റെ ഇന്റർനെറ്റ്' },
  { label: 'ത്ത്ര (tta + ra)', text: 'ത്ത്ര' },
  { label: 'atomic chillu', text: 'ൺ ൻ ർ ൽ ൾ ൿ · കൺ അവൻ അവർ കാൽ അവൾ' },
  { label: 'old-style chillu via ZWJ (ന + ് + ZWJ)', text: 'ന്\u200D അവന്\u200D' },
  { label: 'ZWNJ-broken conjunct (ക് + ZWNJ + ഷ)', text: 'ക്\u200Cഷ' },
  { label: 'dot reph (ൎ)', text: 'ൎ കൎമ്മം' },
  { label: 'sentence', text: 'കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏത്?' },
];

type Face = { name: string; note: string; className?: string; family?: string };

const FACES: Face[] = [
  { name: 'Swap face', note: 'Noto Sans Malayalam (font-display: swap), the default stacks' },
  {
    name: 'Live face',
    note: 'Noto Sans Malayalam Live (font-display: optional), via .font-face-live',
    className: 'font-face-live',
  },
  {
    name: 'Fallback only',
    note:
      'Noto Sans Malayalam Fallback, then generic sans-serif. Noto UI here = local() resolved; a generic sans = it did not. Android may fall back to Noto UI for sans-serif anyway, so trust the status line above: loaded = resolved, error = not.',
    family: "'Noto Sans Malayalam Fallback', sans-serif",
  },
];

const SIZES = [
  { name: 'body', size: 'var(--text-body)', lineHeight: 'var(--text-body--line-height)', token: 'body' },
  { name: 'question', size: 'var(--text-question)', lineHeight: 'var(--text-question--line-height)', token: 'question' },
];

/** Load status of each @font-face of a family (loaded = the local() name resolved). */
function useFaceStatus(family: string): string {
  const [status, setStatus] = useState('checking…');
  useEffect(() => {
    let cancelled = false;
    if (typeof document === 'undefined' || !document.fonts) {
      setStatus('FontFaceSet unavailable');
      return;
    }
    const faces = () => [...document.fonts].filter((face) => face.family.replace(/["']/g, '') === family);
    void Promise.allSettled(faces().map((face) => face.load())).then(() => {
      if (cancelled) return;
      const found = faces();
      setStatus(found.length === 0 ? 'no @font-face found' : found.map((f) => `${f.weight}: ${f.status}`).join(', '));
    });
    return () => {
      cancelled = true;
    };
  }, [family]);
  return status;
}

export default function ShapingFixture() {
  useDocumentTitle('shaping fixture');
  const fallbackStatus = useFaceStatus('Noto Sans Malayalam Fallback');

  return (
    <PageColumn className="gap-8 py-6">
      <main lang="en" data-dev-fixture="shaping" className="flex flex-col gap-8">
        <h1 className="text-card-title font-card-title">Malayalam shaping fixture</h1>
        <p className="text-muted">
          Every sample must shape (stacked conjuncts, chillu as single letters) with no dotted circle.
        </p>
        <p className="text-label">
          Fallback local() status: <code className="font-code text-code">{fallbackStatus}</code>
        </p>

        {FACES.map((face) => (
          <section key={face.name} className={['flex flex-col gap-3', face.className].filter(Boolean).join(' ')}>
            <h2 className="text-title font-title">{face.name}</h2>
            <p className="text-caption text-muted">{face.note}</p>
            {SIZES.map((size) => {
              const style: CSSProperties = {
                fontFamily: face.family ?? `var(--font-${size.token})`,
                fontSize: size.size,
                lineHeight: size.lineHeight,
              };
              return (
                <ul key={size.name} className="flex flex-col gap-2 rounded-md border border-hairline bg-card p-3">
                  <li className="text-label text-muted">{size.name} size</li>
                  {SAMPLES.map((sample) => (
                    <li key={sample.label} className="flex min-w-[0] flex-col">
                      <span className="text-label text-muted">{sample.label}</span>
                      <span lang="ml" style={style}>
                        {sample.text}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })}
          </section>
        ))}
      </main>
    </PageColumn>
  );
}
