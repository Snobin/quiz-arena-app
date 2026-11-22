import { useTranslation } from 'react-i18next';
import { isPlainLeftClick, Link } from '../../shell/Link.tsx';
import { setReturnFocus } from '../../shell/returnFocus.ts';
import { LockIcon } from './icons.tsx';
import { signInPath } from './signInPath.ts';

const LIST_PATH = '/me/custom-topics';
const ROW_ID = 'meCustomTopics';

/**
 * The Me tab's Custom Topics row (Story 6.2). Registered players open the Import screen. A guest sees it locked in the Story 1.5
 * pattern (muted title, half-opacity icon, lock + "Sign in") and goes to the Sign-in prompt, which brings her back to Import.
 */
export function CustomTopicsRow({ locked }: { locked: boolean }) {
  const { t } = useTranslation();
  return (
    <ul className="rounded-lg border border-hairline bg-card">
      <li>
        <Link
          id={ROW_ID}
          to={locked ? signInPath(LIST_PATH) : LIST_PATH}
          aria-label={locked ? t('me.customTopics.locked.a11y') : undefined}
          onClick={(event) => {
            if (locked && isPlainLeftClick(event)) setReturnFocus(ROW_ID, '/me');
          }}
          className="flex min-h-target-min w-full min-w-[0] items-center gap-3 rounded-lg px-4 py-2"
        >
          <span className="flex min-w-[0] flex-1 flex-col">
            <span className={`text-body font-semibold ${locked ? 'text-muted' : 'text-ink'}`}>{t('me.customTopics')}</span>
            <span className="text-caption text-muted">{t('me.customTopics.sub')}</span>
          </span>
          {locked ? (
            <span className="flex flex-none items-center gap-1 text-caption font-semibold text-muted">
              <LockIcon />
              {t('mode.locked.label')}
            </span>
          ) : (
            <span aria-hidden="true" className="flex-none text-muted">
              ›
            </span>
          )}
        </Link>
      </li>
    </ul>
  );
}
