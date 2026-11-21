import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../design/Button.tsx';
import { PageColumn } from '../design/PageColumn.tsx';
import { Link } from './Link.tsx';
import { resetFailedLazies } from './lazyWithRetry.ts';

const CHUNK_ERROR = /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'ChunkLoadError' || CHUNK_ERROR.test(error.message));
}

type Props = {
  children: ReactNode;
  /** `screen`: message, Retry and a way Home. `silent`: renders nothing (an optional extra that failed to load). */
  variant?: 'screen' | 'silent';
};
type State = { error: Error | null };

/**
 * Catches a rejected lazy import (offline, evicted chunk, stale deploy). Retry clears the error so the child
 * renders again; pair the lazy components with `lazyWithRetry` so that render actually re-imports. Other render
 * errors show the same fallback but are always logged.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(isChunkLoadError(error) ? 'Chunk failed to load' : 'Render error caught by boundary', error, info.componentStack);
  }

  private retry = () => {
    resetFailedLazies();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.variant === 'silent') return null;
    return <ChunkFallback onRetry={this.retry} />;
  }
}

const focusHeading = (el: HTMLElement | null) => el?.focus({ preventScroll: true });

function ChunkFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <PageColumn className="py-4">
      <main role="alert" className="flex flex-col gap-3">
        <h1
          tabIndex={-1}
          className="font-title text-title"
          ref={focusHeading}
        >
          {t('chunk.title')}
        </h1>
        <p className="text-body text-muted">{t('chunk.body')}</p>
        <Button onClick={onRetry}>{t('common.retry')}</Button>
        <Link to="/" className="hit-target inline-flex min-h-target-min items-center text-body text-ink underline">
          {t('title.home')}
        </Link>
      </main>
    </PageColumn>
  );
}
