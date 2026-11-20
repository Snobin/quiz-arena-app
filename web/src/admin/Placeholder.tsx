import { adminT, type AdminKey } from './adminI18n.ts';
import { useAdminTitle } from './useAdminTitle.ts';

/** A nav item whose surface is not built yet. A later story replaces it. */
export function Placeholder({ heading, message }: { heading: AdminKey; message: AdminKey }) {
  useAdminTitle(adminT(heading));
  return (
    <main className="flex flex-col gap-3">
      <h1 tabIndex={-1} className="font-title text-title">
        {adminT(heading)}
      </h1>
      <p className="text-muted">{adminT(message)}</p>
    </main>
  );
}
