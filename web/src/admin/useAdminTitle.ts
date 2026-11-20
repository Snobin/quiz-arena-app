import { useEffect } from 'react';
import { adminT } from './adminI18n.ts';

/** `document.title` = "<page> · Admin · Minnal"; restored on unmount. Pass an already translated page name. */
export function useAdminTitle(page: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = adminT('title.page', { page });
    return () => {
      document.title = previous;
    };
  }, [page]);
}
