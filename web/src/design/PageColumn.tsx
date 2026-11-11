import type { ReactNode } from 'react';

type PageColumnProps = {
  children: ReactNode;
  className?: string;
};

/**
 * The single page column: full width up to 480px, centred above that. Reflow-safe: min-height
 * only (never a fixed height), min-w-0 so flex/grid children can shrink, and no horizontal page
 * scroll at 320 CSS px or at 360px with 200% text.
 */
export function PageColumn({ children, className }: PageColumnProps) {
  return (
    <div
      className={['mx-auto flex min-h-dvh w-full min-w-0 max-w-[480px] flex-col px-gutter-card', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
