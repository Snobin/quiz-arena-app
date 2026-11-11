import type { CSSProperties, ReactNode } from 'react';
import { BrandMark } from './BrandMark.tsx';
import { Button } from './Button.tsx';
import { PageColumn } from './PageColumn.tsx';
import { colors, darkSwapped, typography, type TypographyToken } from './tokens.ts';

// Dev-only QA page at /__design (never shipped: App imports it behind import.meta.env.DEV).
// Strings here are developer-facing and not part of the i18n catalogue.

function typeStyle(name: TypographyToken): CSSProperties {
  return {
    fontFamily: `var(--font-${name})`,
    fontSize: `var(--text-${name})`,
    fontWeight: `var(--text-${name}--font-weight)`,
    lineHeight: `var(--text-${name}--line-height)`,
    letterSpacing: 'letterSpacing' in typography[name] ? `var(--text-${name}--letter-spacing)` : undefined,
  };
}

function Swatch({ name, background }: { name: string; background: string }) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-md border border-hairline bg-card p-2">
      <span
        aria-hidden="true"
        className="size-8 shrink-0 rounded-sm border border-hairline"
        style={{ background }}
      />
      <span className="min-w-0 text-label text-ink">
        <code className="font-code text-code">{name}</code>
        <br />
        <span className="text-muted">{background}</span>
      </span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title font-title">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignFixture() {
  return (
    <PageColumn className="gap-8 py-6">
      <main lang="en" className="flex flex-col gap-8">
        <h1 className="text-card-title font-card-title">
          <BrandMark /> design fixture
        </h1>
        <p className="text-muted">Toggle the OS dark mode: surfaces swap live. Tab through to check focus rings.</p>

        {/* check-tokens: swatch-list start (raw token values, volt and dim included) */}
        <Section title="Raw colour tokens">
          <ul className="grid grid-cols-1 gap-1 min-[400px]:grid-cols-2">
            {Object.entries(colors).map(([name, value]) => (
              <Swatch key={name} name={name} background={value} />
            ))}
          </ul>
        </Section>

        {/* check-tokens: swatch-list end */}

        <Section title="Semantic surfaces (live, swap in dark)">
          <ul className="grid grid-cols-1 gap-1 min-[400px]:grid-cols-2">
            {darkSwapped.map((name) => (
              <Swatch key={name} name={name} background={`var(--color-${name})`} />
            ))}
          </ul>
        </Section>

        <Section title="Type scale">
          <ul className="flex flex-col gap-3">
            {(Object.keys(typography) as TypographyToken[]).map((name) => (
              <li key={name} className="flex min-w-0 flex-col">
                <code className="font-code text-code text-muted">{name}</code>
                <span style={typeStyle(name)}>
                  <span lang="ml">മിന്നൽ ചോദ്യം</span> Minnal 1,234
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-start gap-3">
            <Button onClick={() => console.info('primary')}>Primary</Button>
            <Button variant="secondary" onClick={() => console.info('secondary')}>
              Secondary
            </Button>
            <Button disabled disabledReason="Sign-in is coming soon" onClick={() => console.info('never')}>
              Disabled
            </Button>
          </div>
        </Section>

        <Section title="BrandMark">
          <p className="flex flex-wrap gap-6 text-title">
            <BrandMark language="ml" />
            <BrandMark language="en" />
          </p>
        </Section>

        <Section title="Band surface + focus ring">
          <div className="surface-band flex flex-col gap-3 rounded-xl p-4">
            <p>Focus rings inside a band use on-band.</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="hit-target rounded-md px-4 underline">
                Band text button
              </button>
              <a href="#__design" className="hit-target underline">
                Band link
              </a>
            </div>
          </div>
        </Section>

        <Section title="Hit targets">
          {/* Small visuals, 48px hit boxes: the 32px gap keeps adjacent hit areas from overlapping. */}
          <div className="flex flex-wrap gap-8 p-4">
            {['EN', 'A', 'B'].map((label) => (
              <button key={label} type="button" className="hit-target min-w-4 rounded-sm border border-ink px-1 text-label">
                {label}
              </button>
            ))}
          </div>
        </Section>
      </main>
    </PageColumn>
  );
}
